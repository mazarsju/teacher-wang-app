# Voice Interaction (TTS & STT)

## Status

Accepted — text-to-speech (playback, one fixed OpenAI voice per character, reading/listening mode, speed control) is implemented. Speech-to-text recording and transcription (press-and-hold record button → `POST /chat/stt` → learner reviews the transcript in the message input before sending) is implemented; listening challenges (a dedicated exercise type reusing this same `/chat/stt` endpoint for shadowing) are also implemented — see [listening-practice.md](./listening-practice.md). Pronunciation-quality feedback and the "realistic voice" ElevenLabs provider switch were both considered and explicitly dropped (see Decision) — out of scope, not just unstarted.

Related: [plan-management.md](./plan-management.md) (`/chat/tts` and `/chat/stt` are gated and deducted against the same per-plan `available_token` budget as chat, via an estimated token count — see Decision below; every plan, including pro, is capped), [frontend-localization.md](./frontend-localization.md) (per-character description strings), [schema tenancy](../architecture/schema-tenancy.md) (generic `settings` key/value store used for the listening preferences), [listening-practice.md](./listening-practice.md) (the shadowing exercise that reuses `POST /chat/stt`).

**ElevenLabs is not used anywhere in this repo.** An earlier revision of this feature synthesized "realistic voice" chat replies through ElevenLabs for pro accounts; that path was removed (see Decision) in favor of OpenAI TTS only, since it's cheaper and avoids maintaining a second provider for a perk few users noticed. ElevenLabs is still used, but only in a **separate repository** that pre-generates the fixed audio clips for the listening-practice content catalog (see [listening-practice.md](./listening-practice.md)) — a one-time batch job, not a live per-request call, so it doesn't need the live-request cost controls this ADR describes.

## Context

Learners read Chinese but the app had no audio. Two needs drive this feature:

1. Give every AI chat reply (Teacher Wang, Xiao Ming, challenge characters) a played-back voice, distinct per character.
2. Let the learner tune how listening fits their study style: normal reading with optional audio, or an audio-first "listening" mode that hides the text until revealed, plus a speed knob relative to their HSK level.

An earlier iteration also explored offering a more natural-sounding voice (ElevenLabs) as a pro-plan perk. That was implemented, then removed — see Decision.

Constraints:

| Topic | Answer |
| --- | --- |
| Provider | OpenAI TTS (`tts-1`, reuses the chat `LLM_API_KEY`) for everyone, every plan |
| Who calls it | Only the frontend, per message, on demand — not batch-generated server-side |
| Cost control | Both `/chat/tts` and `/chat/stt` are gated/deducted against the same `available_token` budget as chat, for **every** plan (see Decision below) |
| Voice selection | Fixed per character (not user-selectable), picked once when the character was created |
| Speed | Derived, not literal client input — HSK level sets a baseline, a user preference nudges it |

## Options considered

| Option | What it is | Outcome |
| --- | --- | --- |
| **A. One shared voice for every character** | Single `voice="alloy"` for all TTS calls | Rejected — flattens characters that are meant to read as a distinct person (waitress vs. taxi driver, etc.) |
| **B. Per-character fixed voice, chosen at creation time** | Each `ChatCharacter` carries a `gender` + one voice, hardcoded in `chatCharacters.ts`/`challenges.ts` | **Chosen** |
| **C. Random voice per message** | Pick a voice per TTS call | Rejected — inconsistent voice across a single character's replies |
| **D. Client-supplied arbitrary speed** | Learner sends a raw playback rate | Rejected — replaced by two composable, validated inputs (an HSK-derived base + a bounded adjustment) |
| **E. Fold TTS into `POST /chat`, generating audio for every reply server-side** | One combined call | Rejected — couples an unrelated external call to the main chat latency/cost path; lazy per-bubble fetch from the frontend is cheaper and keeps `/chat` fast |
| **H. Keep a pro-only ElevenLabs "realistic voice" provider switch** (superseded option B/F/G from an earlier revision — see the ElevenLabs decision below) | A second TTS provider, server-resolved from plan + a `realistic_voice_enabled` preference, with the client sending both of a character's voice options so it couldn't force the paid provider | Rejected on revisit — the maintenance cost (a second client, a hardcoded voice-id table worked around a scope-restricted API key, a `realistic_voice_enabled` preference and its downgrade-effective-value logic) wasn't worth it for a perk few users noticed; OpenAI TTS for everyone is cheaper and simpler. ElevenLabs still earns its keep for **pre-generating** the listening-practice audio catalog in a separate repo, a one-time batch cost instead of a per-request one |

## Decision

### Backend: `POST /chat/tts`

`backend/routes/chat.py` — given `{ "text": "...", "voice": "<name>" }` (the client sends the speaking character's one fixed voice, validated against `TTS_VOICES`), the route:

1. Calls `assert_plan_has_tokens(user)` (same check `_invoke_llm` uses for chat — see [plan-management.md](./plan-management.md)) — `400` with a plan-appropriate exhaustion message if `available_token <= 0`. This applies to **every** plan, not just free (see Decision in [plan-management.md](./plan-management.md)), and runs **before** generating audio, so an exhausted account never reaches OpenAI for this call.
2. Generates the audio and streams back `audio/mpeg`: `get_openai_client().audio.speech.create(model="tts-1", voice=voice, input=text, speed=..., response_format="mp3")`.
3. On success, charges `estimate_text_tokens(text)` (`backend/utils/aiChat/token_usage.py`, a `tiktoken` `cl100k_base` count of the TTS input) as `input_tokens` via the shared `_charge_token_usage` helper — records a `token_count` row (`record_token_usage`) and deducts it from `available_token` (`deduct_available_token`), for every plan.

`speed` is never client-supplied. It is computed server-side as:

```
speed = get_chat_tts_speed(user_id) + get_chat_listen_speed_adjustment(user_id) / 100
```

- `get_chat_tts_speed` (`backend/utils/knowledgeBase/hsk_level.py`) maps the learner's chat-speaking HSK level — the same level the chat agent already speaks at, `get_chat_speaking_hsk_level` — to a base speed: 0.75 at HSK1 up to 1.1 at HSK6+ (`tts_speed_for_hsk_level` / `TTS_SPEED_BY_HSK_LEVEL`).
- `get_chat_listen_speed_adjustment` (`backend/utils/database/settings.py`) is a per-user preference, one of `-20/-10/0/10/20` (percent), added as a fraction.

### Character voices

`ChatCharacter` (`frontend/src/components/ChatCharacterCard.tsx`) has `gender: "male"|"female"` and `voice: OpenAiTtsVoiceName` (`frontend/src/types/chat.ts`). Every character — Teacher Wang, Xiao Ming, and the 12 challenge roles — carries exactly one fixed voice, hardcoded in `chatCharacters.ts`/`challenges.ts`: `alloy` / `echo` / `fable` / `onyx` for male characters, `nova` / `shimmer` for female, varied per character. The `create-challenge` skill picks one at creation time and calls out checking gender-agreement in translations (a real miss found for French occupation nouns, e.g. `serveur`→`serveuse`, `chauffeur`→`conductrice`).

Three avatars that had been drawn male for a role later assigned female (librarian, interviewer, landlord) were regenerated via the `generate-dicebear-avatar` skill; that skill also gained a banned hair-variant list (`variant61`–`63`, found to render badly).

### Preferences: `/preferences/chat-setup`

Two per-user settings in the generic `settings` key/value store (`backend/utils/database/settings.py`):

| Setting | Values | Default |
| --- | --- | --- |
| `chat_listening_mode` | `reading_first` \| `listening_first` | `reading_first` |
| `chat_listen_speed_adjustment` | `-20` / `-10` / `0` / `10` / `20` | `0` |

`GET`/`PATCH /preferences/chat-setup` (`backend/routes/chat_setup_preference.py`) reads/writes either or both. The Preferences page's "Chat setup" section (placed after Anki sync) exposes two explicit radio cards spelling out the reading-first/listening-first trade-off, and a 5-step slider for the speed adjustment. There is no pro-only provider toggle any more — every plan gets the same OpenAI voice, so there's nothing to gate here (the `realistic_voice_enabled` setting, its `403`-unless-pro PATCH check, and its "effective value on downgrade" GET logic were all removed with the ElevenLabs path).

### Frontend playback (`ChatModal.tsx`)

- `isChineseOnlyText` (`utils/aiChat/chineseText.ts`) gates which assistant messages get a listen control — pure-Chinese replies only; a mixed-language reply (e.g. an English grammar explanation) gets no button. This is also what gates `listening_first` masking (see Open question 4, resolved below) — a segmented reply with a `[[stage direction]]` is never masked, only rendered as its own unmasked segment.
- The listen button lives **inside** the message bubble, at the end of the text. Clicking it lazily triggers `POST /chat/tts` for that bubble if not already cached — this also covers messages loaded from history, not just fresh replies — and plays as soon as the response arrives; a loading spinner replaces the icon while the call is in flight. Fetched audio is cached as an object URL for the conversation's lifetime and revoked on unmount / character switch.
- Freshly-received replies eagerly pre-fetch audio in the background (silently, no autoplay), so the button is usually already loaded by the time the learner clicks it.
- In `listening_first` mode: the reply text renders CSS-blurred behind an eye ("reveal") button; the listen button stays visible next to it so both controls are reachable while the text is masked. Audio for a fresh reply autoplays as soon as it's fetched. Reveal is per-message and permanent once clicked; both the mask and the audio cache reset when the conversation/character changes.

### Backend: `POST /chat/stt`

`backend/routes/chat.py` — given a multipart `audio` file field (whatever `MediaRecorder` produced, typically `audio/webm`), the route:

1. Calls `assert_plan_has_tokens(user)` before touching OpenAI — same `400` exhaustion behavior as `/chat/tts` (every plan gated), and before spending any money transcribing audio for an exhausted account.
2. Calls `get_openai_client().audio.transcriptions.create(model="whisper-1", file=(filename, bytes, mimetype), language="zh")`. The `language="zh"` hint is hardcoded, not derived from the learner's app locale — every character in this app is a Mandarin-speaking role regardless of the UI language the learner reads in.
3. On success, charges `estimate_text_tokens(transcript.text)` as `output_tokens` (the learner's spoken words, transcribed, are the "generated" side of this call, mirroring how a chat reply's tokens are `output_tokens`) via the same `_charge_token_usage` helper as `/chat/tts`. Charging uses the raw Whisper transcript, before the filter below is applied, since that's the actual cost incurred.
4. Strips the transcript down to Chinese characters and digits (`_chinese_and_digits_only`, a `[一-鿿0-9]+` regex extraction) before responding — Whisper occasionally hallucinates stray Latin words/punctuation, and this app only ever wants Hanzi (plus numbers, e.g. an age, a room number, a date) in the message input. If nothing in that range matched (silence, background noise, non-Mandarin speech), the response is `{ "text": "" }`; the frontend treats an empty string as "no speech detected" and shows an error instead of clearing whatever the learner had already typed.

The response is `{ "text": "<filtered text>" }`; a missing `audio` field is `400`, a transcription failure is `500` (and charges nothing — the charge only runs after a successful transcription). No conversation persistence — the learner reviews/edits the transcript in the message input and sends it through the normal `POST /chat` flow themselves.

### Frontend recording (`useVoiceInput` hook, shared by `ChatModal.tsx`, `VoiceInputButton.tsx`, and `ShadowingSentence.tsx`)

A small icon-only "record" button (mic icon, an icon-only-trigger exception to the `Button.tsx` kind/variant system — see [frontend-styling.md](./frontend-styling.md)) sits next to the text field in the chat composer, the writing/grammar exercise inputs, and the listening shadowing exercise. All three now share one `useVoiceInput` hook (`frontend/src/hooks/useVoiceInput.ts`) instead of three copies of the same `MediaRecorder` plumbing.

It is a **press-and-hold** control, not a toggle, modeled as an explicit three-phase state machine (`idle` → `recording` → `processing` → `idle`), not a pair of independent booleans:

- `idle → recording`: `onMouseDown`/`onTouchStart` requests the mic (`navigator.mediaDevices.getUserMedia`) and starts a `MediaRecorder`. A no-op if not currently `idle` (guards against a stray second press).
- `recording → processing`: `onMouseUp`/`onMouseLeave`/`onTouchEnd`/`onTouchCancel` stops the recorder, assembles the recorded chunks into a `Blob`, and posts it to `/chat/stt`. The button is `disabled` and shows a pulsing-opacity animation (`voice-input-processing-pulse`, defined once in `shared.css` and reused by each button's own module CSS) so the learner can see it's busy and can't be clicked mid-transcription.
- `processing → idle`: once the request settles (success, empty-transcript, or error), the phase resets to `idle` regardless of outcome.

Both mouse and touch events are wired to the same handlers (`event.preventDefault()` on the touch handlers stops the browser from also firing synthetic mouse events, which would otherwise double-invoke start/stop); `touch-action: none` on each button keeps a scroll gesture from cancelling the press. The returned text is always **appended** to whatever is already in the host field (ChatModal's message input, `VoiceInputButton`'s field, `ShadowingSentence`'s shadowing input) — it is never auto-submitted, so the learner reviews (and can edit) the transcript first. An empty transcript (no Chinese characters or digits detected) is never applied to the field — the hook surfaces a "no speech detected" error instead, so a learner who accidentally records silence doesn't lose text they'd already typed. The mic stream's tracks are stopped both after each recording and on unmount (a `useEffect` cleanup inside the hook) so the browser's mic-in-use indicator doesn't linger.

Each button's "active" (red) style is applied both by the `recording` phase's CSS class **and** by the plain CSS `:active` pseudo-class (`button:active:not(:disabled)`). This matters on mobile: `getUserMedia` can take a noticeable moment to resolve (mic permission/hardware init), so if the red styling depended solely on the React `phase` reaching `recording`, a finger press would visually lag behind the actual touch. `:active` is applied by the browser the instant the finger goes down, with no JS/render round-trip, so the button looks pressed immediately regardless of how long the mic takes to actually come online; once `phase` catches up to `recording` the two styles are identical, so there's no visible jump.

## Out of scope (remaining)

- STT: analyzing pronunciation quality/mistakes from the recording (recording + transcription itself is done — see above). Deliberately dropped, not just deferred — see Open question 3, resolved.
- A click-to-toggle alternative to press-and-hold (touch/pointer support for the press-and-hold gesture itself is implemented — see Decision).
- A real per-provider dollar cost for TTS/STT accounting — `record_token_usage` prices these estimated-token events at the configured chat model's per-token rate (see [plan-management.md](./plan-management.md)), not tts-1/whisper-1's actual per-character/per-minute billing.
- User-selectable voice — voice is fixed per character, not a learner preference.
- Playback controls beyond a single restart-on-click — no stop button, no queue; a second click restarts from the top.
- Server-side caching of generated audio (see Open question 2, resolved) — the same assistant sentence is re-synthesized every time a different conversation or a reloaded page needs it.
- A second TTS provider / "realistic voice" perk — deliberately dropped, not deferred (see Decision, option H). ElevenLabs remains in use, but only in a separate repo for pre-generating the listening-practice audio catalog.

## Consequences

### Advantages

- Per-character voice keeps the roster feeling distinct without any new backend state (voice is static frontend data, not stored per user).
- Speed composition (HSK base + bounded adjustment) reuses the level the chat agent already speaks at, so listening pace matches reading pace by default.
- Lazy, per-bubble fetch keeps `/chat/tts` cheap and simple — no batch generation, no server-side audio storage.
- The masking/reveal + listen-button pattern is opt-in (`reading_first` is the default) and changes nothing for learners who don't touch the preference.
- A single provider (OpenAI) for every plan removes an entire class of complexity the earlier ElevenLabs path carried: no server-side provider resolution, no plan-based preference to gate/report an "effective" value for, no second client, no hardcoded voice-id table worked around a scope-restricted API key.
- Every plan is now capped the same way (see [plan-management.md](./plan-management.md)) — a compromised or runaway pro-plan client can no longer generate unbounded TTS/STT calls.

### Drawbacks / follow-ups

- No caching across sessions or users: the same assistant sentence is re-synthesized every time a different conversation (or a reloaded page) needs it — object URLs live only for the mounted `ChatModal`, nothing is persisted.
- Voice assignment is entirely manual/static; adding a new challenge character requires a human (or the `create-challenge` skill) to pick a plausible voice — there is no runtime gender inference.
- `isChineseOnlyText` is a blunt gate — a reply that's mostly Chinese with one stray Latin character or digit gets no listen button at all.
- Pro-plan token exhaustion (rare, since `PRO_PLAN_TOKEN_GRANT` is 100× the free grant) surfaces the same class of `400` error chat already returns on the free plan — there's no separate product messaging yet for "your plan's monthly allowance, not just the free tier's, ran out."

## Open questions for a future revision

1. ~~Should pro accounts get any cap too?~~ **Resolved:** every plan is now gated/charged the same way (`assert_plan_has_tokens`, `deduct_available_token` — see [plan-management.md](./plan-management.md)), just against a higher `PRO_PLAN_TOKEN_GRANT` budget instead of `FREE_PLAN_MAX_ALLOWED_TOKEN`. The gate checks `available_token <= 0` *before* the call and the deduction happens *after*, from actual (chat) or estimated (TTS/STT) usage — no attempt is made to estimate a call's cost ahead of time to keep it from overshooting the remaining budget, so a single large call can push `available_token` negative; the next call is then blocked until the monthly reset. Real per-provider billing units (characters/minutes) instead of the token estimate remain unresolved — not pursued, since the estimate is accurate enough to gate correctly.
2. ~~Should generated audio be cached server-side?~~ **Resolved, for now: no.** Not worth the complexity at current usage; revisit if OpenAI TTS cost becomes material.
3. ~~Where does pronunciation-quality feedback come from?~~ **Resolved: dropped, not pursued for now.** No separate LLM judge call or phonetic scoring is planned; shadowing/STT stays text-match-only (see [listening-practice.md](./listening-practice.md)).
4. ~~Should `listening_first` eventually extend to `[[stage direction]]` segments?~~ **Resolved: no** — stays scoped to plain Chinese-only bubbles, which is already the current (and now confirmed intentional) behavior: a segmented reply with a stage direction renders its segments unmasked regardless of `listening_first` (`ChatModal.tsx`'s `hasStage` branch never applies the `isMasked` check).
5. Not applicable — ElevenLabs voice variety/assignment is no longer this repo's concern; it now belongs to whatever process maintains the separate listening-practice content repo.
