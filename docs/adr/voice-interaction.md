# Voice Interaction (TTS)

## Status

Draft / partially accepted — text-to-speech (playback, per-character voices on two providers, reading/listening mode, speed control, a pro-only "realistic voice" provider switch) is implemented. Speech-to-text (recording, transcription, pronunciation feedback) and listening challenges are not started (README roadmap §12).

Related: [plan-management.md](./plan-management.md) (the free-plan token budget does **not** cover TTS calls; `realistic_voice_enabled` is a separate, plan-based gate — see Open questions), [frontend-localization.md](./frontend-localization.md) (per-character description strings), [schema tenancy](../architecture/schema-tenancy.md) (generic `settings` key/value store used for the new preferences).

## Context

Learners read Chinese but the app had no audio. Three related needs drove this feature across several iterations:

1. Give every AI chat reply (Teacher Wang, Xiao Ming, challenge characters) a played-back voice, distinct per character.
2. Let the learner tune how listening fits their study style: normal reading with optional audio, or an audio-first "listening" mode that hides the text until revealed, plus a speed knob relative to their HSK level.
3. Offer a more natural-sounding voice as a pro-plan perk, without hard-coupling the rest of the feature to one vendor.

Constraints:

| Topic | Answer |
| --- | --- |
| Providers | OpenAI TTS (`tts-1`, reuses the chat `LLM_API_KEY`) for everyone; ElevenLabs (`eleven_multilingual_v2`, own `ELEVENLABS_API_KEY`) for pro accounts that opt in |
| Who calls it | Only the frontend, per message, on demand — not batch-generated server-side |
| Which provider is used | **Server-decided, not client-supplied** — the client cannot force ElevenLabs by sending a flag; see Decision |
| Cost control | No dedicated token/cost budget for either provider (see Open questions); ElevenLabs access itself is plan-gated |
| Voice selection | Fixed per character per provider (not user-selectable), picked once when the character was created |
| Speed | Derived, not literal client input — HSK level sets a baseline, a user preference nudges it (applied to whichever provider ends up used) |

## Options considered

| Option | What it is | Outcome |
| --- | --- | --- |
| **A. One shared voice for every character** | Single `voice="alloy"` for all TTS calls | Rejected — flattens characters that are meant to read as a distinct person (waitress vs. taxi driver, etc.) |
| **B. Per-character fixed voice, chosen at creation time** | Each `ChatCharacter` carries a `gender` + one voice per provider, hardcoded in `chatCharacters.ts`/`challenges.ts` | **Chosen** |
| **C. Random voice per message** | Pick a voice per TTS call | Rejected — inconsistent voice across a single character's replies |
| **D. Client-supplied arbitrary speed** | Learner sends a raw playback rate | Rejected — replaced by two composable, validated inputs (an HSK-derived base + a bounded adjustment) |
| **E. Fold TTS into `POST /chat`, generating audio for every reply server-side** | One combined call | Rejected — couples an unrelated external call to the main chat latency/cost path; lazy per-bubble fetch from the frontend is cheaper and keeps `/chat` fast |
| **F. Client picks the provider** (e.g. a `provider` field in the `/chat/tts` request) | Frontend decides chatgpt vs. elevenlabs and tells the backend | Rejected — a modified client could claim `elevenlabs` regardless of plan, silently bypassing the pro gate. The client instead sends *both* of a character's voice options; the backend alone decides which one it actually uses |
| **G. Separate per-provider character catalogs** | Two independent voice tables/files, joined by character id at request time | Rejected — more files to keep in sync for no benefit; a single `voice: CharacterVoiceOption[]` array on each character (one entry per provider) keeps both options next to everything else about that character |

## Decision

### Backend: `POST /chat/tts`

`backend/routes/chat.py` — given `{ "text": "...", "voices": [{ "provider": "chatgpt"|"elevenlabs", "name": "..." }, ...] }` (the client sends every voice option it has for the speaking character — normally both), the route:

1. Resolves the provider itself, ignoring anything the client might imply about it: `_resolve_tts_provider(plan, user_id)` returns `"elevenlabs"` only when `plan == "pro"` **and** `get_chat_realistic_voice_enabled(user_id)`; otherwise `"chatgpt"`.
2. Picks the `name` from the `voices` array matching that resolved provider (`400` if the client didn't send one for it).
3. Generates the audio with that provider and streams back `audio/mpeg`:
   - **chatgpt**: `get_openai_client().audio.speech.create(model="tts-1", voice=name, input=text, speed=..., response_format="mp3")` (`name` validated against `TTS_VOICES`).
   - **elevenlabs**: `generate_speech(name, text, speed)` in `backend/utils/aiChat/elevenlabs_client.py` — POSTs to `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with `model_id="eleven_multilingual_v2"` and `voice_settings.speed` (clamped to ElevenLabs' `[0.7, 1.2]` accepted range), where `voice_id` comes from a small hardcoded `name → voice_id` table (`ELEVENLABS_VOICE_IDS`) — chosen because the API key in use lacks the `voices_read` scope, so the backend cannot resolve names to ids at runtime (see the quirk note below).

`speed` is never client-supplied, for either provider. It is computed server-side as:

```
speed = get_chat_tts_speed(user_id) + get_chat_listen_speed_adjustment(user_id) / 100
```

- `get_chat_tts_speed` (`backend/utils/knowledgeBase/hsk_level.py`) maps the learner's chat-speaking HSK level — the same level the chat agent already speaks at, `get_chat_speaking_hsk_level` — to a base speed: 0.75 at HSK1 up to 1.1 at HSK6+ (`tts_speed_for_hsk_level` / `TTS_SPEED_BY_HSK_LEVEL`).
- `get_chat_listen_speed_adjustment` (`backend/utils/database/settings.py`) is a per-user preference, one of `-20/-10/0/10/20` (percent), added as a fraction.

### Character voices

`ChatCharacter` (`frontend/src/components/ChatCharacterCard.tsx`) has `gender: "male"|"female"` and `voice: CharacterVoiceOption[]`, where `CharacterVoiceOption` is `{ provider: "chatgpt"; name: OpenAiTtsVoiceName } | { provider: "elevenlabs"; name: ElevenLabsVoiceName }` (`frontend/src/types/chat.ts`). Every character — Teacher Wang, Xiao Ming, and the 12 challenge roles — carries exactly one entry per provider, fixed in `chatCharacters.ts`/`challenges.ts`:

| Provider | Male voices | Female voices |
| --- | --- | --- |
| chatgpt | `alloy` / `echo` / `fable` / `onyx` (varied per character) | `nova` / `shimmer` (varied per character) |
| elevenlabs | 13 confirmed free-tier voices, one randomly assigned per male character (`antoni`, `chris`, `callum`, `eric`, `roger`, `daniel`, `arnold` in use; `charlie`/`george`/`liam`/`will`/`brian`/`adam` unused, free for new characters) | 6 confirmed free-tier voices, one randomly assigned per female character (`sarah`, `jessica`, `alice`, `matilda`, `laura`, `lily`; `sarah` reused once since there are 7 female characters and only 6 voices) |

The `elevenlabs` names map to voice ids in `ELEVENLABS_VOICE_IDS` (`backend/utils/aiChat/elevenlabs_client.py`) — the frontend never sees or needs the raw id. The `create-challenge` skill now requires both provider entries for a new character, and calls out checking gender-agreement in translations (a real miss found for French occupation nouns, e.g. `serveur`→`serveuse`, `chauffeur`→`conductrice`).

Three avatars that had been drawn male for a role later assigned female (librarian, interviewer, landlord) were regenerated via the `generate-dicebear-avatar` skill; that skill also gained a banned hair-variant list (`variant61`–`63`, found to render badly).

### Preferences: `/preferences/chat-setup`

Three per-user settings in the generic `settings` key/value store (`backend/utils/database/settings.py`):

| Setting | Values | Default |
| --- | --- | --- |
| `chat_listening_mode` | `reading_first` \| `listening_first` | `reading_first` |
| `chat_listen_speed_adjustment` | `-20` / `-10` / `0` / `10` / `20` | `0` |
| `chat_realistic_voice_enabled` | boolean | `false` |

`GET`/`PATCH /preferences/chat-setup` (`backend/routes/chat_setup_preference.py`) reads/writes any subset. Two things are enforced server-side, not just hidden in the UI:

- `PATCH` rejects `realistic_voice_enabled: true` with `403` unless `plan == "pro"`.
- `GET` reports the **effective** value — `plan == "pro" and <stored setting>` — so a learner who was pro, enabled it, then downgraded sees it as off again without a separate migration to clear the stored bit.

The Preferences page's "Chat setup" section (placed after Anki sync) exposes two explicit radio cards spelling out the reading-first/listening-first trade-off, a 5-step slider for the speed adjustment, and — only rendered when the client's own `currentPlan === "pro"` — a "Realistic voice" toggle styled like the existing Smart AI toggle.

### Frontend playback (`ChatModal.tsx`)

- `isChineseOnlyText` (`utils/aiChat/chineseText.ts`) gates which assistant messages get a listen control — pure-Chinese replies only; a mixed-language reply (e.g. an English grammar explanation) gets no button.
- The listen button lives **inside** the message bubble, at the end of the text. Clicking it lazily triggers `POST /chat/tts` for that bubble if not already cached — this also covers messages loaded from history, not just fresh replies — and plays as soon as the response arrives; a loading spinner replaces the icon while the call is in flight. Fetched audio is cached as an object URL for the conversation's lifetime and revoked on unmount / character switch.
- Freshly-received replies eagerly pre-fetch audio in the background (silently, no autoplay), so the button is usually already loaded by the time the learner clicks it.
- In `listening_first` mode: the reply text renders CSS-blurred behind an eye ("reveal") button; the listen button stays visible next to it so both controls are reachable while the text is masked. Audio for a fresh reply autoplays as soon as it's fetched. Reveal is per-message and permanent once clicked; both the mask and the audio cache reset when the conversation/character changes.

## Out of scope (remaining)

- STT: recording the learner's voice, transcribing it to text within a conversation, analyzing pronunciation (README roadmap §12).
- Listening challenges (a dedicated exercise type).
- Token/cost accounting for TTS calls, on either provider — unlike chat LLM calls, `/chat/tts` is not gated by `plan`/`available_token` (see [plan-management.md](./plan-management.md)); only whether ElevenLabs is reachable at all is plan-gated, not how much of it is used.
- User-selectable voice (voice is fixed per character/provider, not a learner preference) — "realistic voice" switches provider, not which voice.
- Playback controls beyond a single restart-on-click — no stop button, no queue; a second click restarts from the top.
- ElevenLabs voice variety is capped at what the free-tier key can reach today (13 male / 6 female voices) — a female character repeats one voice, and every character is stuck with whatever a one-time random draw assigned it (no re-roll, no per-user variation).

## Consequences

### Advantages

- Per-character voice keeps the roster feeling distinct without any new backend state (voice is static frontend data, not stored per user).
- Speed composition (HSK base + bounded adjustment) reuses the level the chat agent already speaks at, so listening pace matches reading pace by default; the same composed speed applies regardless of which provider ends up serving the request.
- Lazy, per-bubble fetch keeps `/chat/tts` cheap and simple — no batch generation, no server-side audio storage.
- The masking/reveal + listen-button pattern is opt-in (`reading_first` is the default) and changes nothing for learners who don't touch the new preference.
- The provider switch is entirely server-side: the client can send an `elevenlabs` voice option freely, but a free-plan (or realistic-voice-off) account can never actually trigger an ElevenLabs call. No trust is placed in client-declared plan or preference state.

### Drawbacks / follow-ups

- TTS calls have no budget/cost gate on either provider — a very active listening-first user (or a pro user with realistic voice on) could generate many calls with no cap (see Open questions).
- No caching across sessions or users: the same assistant sentence is re-synthesized every time a different conversation (or a reloaded page) needs it — object URLs live only for the mounted `ChatModal`, nothing is persisted. This is more expensive for ElevenLabs, whose free/entry tiers bill per character generated.
- Voice assignment is entirely manual/static; adding a new challenge character requires a human (or the `create-challenge` skill) to pick a plausible voice for **both** providers — there is no runtime gender inference or provider-catalog lookup.
- `isChineseOnlyText` is a blunt gate — a reply that's mostly Chinese with one stray Latin character or digit gets no listen button at all.

**Tooling quirk found mid-implementation, resolved empirically:** the `ELEVENLABS_API_KEY` configured in `.config.txt` is a restricted key without the `voices_read`/`user_read` scopes (`GET /v1/voices` and `GET /v1/user/subscription` both return `401 missing_permissions`), so the backend cannot enumerate the account's plan, quota, or available voice ids via the API. A direct synthesis call with the classic premade voice "Rachel" (`21m00Tcm4TlvDq8ikWAM`) returned `402 payment_required — Free users cannot use library voices via the API`. This is a **voice-access** restriction, not a character-quota one — ElevenLabs' free tier still includes a monthly character allowance, but as of the current API behavior it blocks free-tier API calls to most of the shared voice library regardless of remaining quota. Since listing voices wasn't possible, every documented default/library voice id (the "classic 9" premade set plus the newer ~19-voice default library) was tried directly against the live account (real `POST /v1/text-to-speech/{id}` calls, not guesses, deduplicating by id and verifying a sample of same-length responses actually differ by content hash). Of ~28 candidates tried, **19 returned real audio** instead of `402`: 13 male (`roger`, `charlie`, `george`, `callum`, `liam`, `will`, `eric`, `chris`, `brian`, `daniel`, `antoni`, `arnold`, `adam`) and 6 female (`sarah`, `laura`, `alice`, `matilda`, `jessica`, `lily`) — the rest (`aria`, `charlotte`, `domi`, `bella`, `elli`, `rachel`, `josh`, `sam`) all 402'd. `ELEVENLABS_VOICE_IDS` holds all 19; each character gets one, drawn once (seeded random, recorded in `chatCharacters.ts`/`challenges.ts`) from the pool matching its gender.

## Open questions for a future revision

1. Should `/chat/tts` be covered by the same free-plan budget as chat (README roadmap §8 / [plan-management.md](./plan-management.md)), or get a separate cap? This is now sharper for ElevenLabs specifically, since it bills per character even for pro accounts.
2. Should generated audio be cached server-side (e.g. by a `(provider, voice, text, speed)` hash) to avoid re-synthesizing identical sentences? Especially valuable for ElevenLabs cost.
3. What does STT look like — a new endpoint wrapping OpenAI's transcription API? Where does pronunciation-quality feedback come from — a separate LLM judge call, similar to the existing grammar checker?
4. Should `listening_first` eventually extend to `[[stage direction]]` segments, or stay scoped to plain Chinese-only bubbles as today?
5. Once the ElevenLabs account is upgraded (or more voices are added to its own "My Voices" library), should the female pool grow past 6 (to remove the one forced repeat), and is a fixed random draw per character still right, or should voice assignment become an explicit product decision (e.g. picked to match each character's personality) instead? Re-run the same probe (or, once `voices_read` is granted, just list `GET /v1/voices`) to find what's newly available.
