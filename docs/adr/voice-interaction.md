# Voice Interaction (TTS)

## Status

Draft / partially accepted — text-to-speech (playback, per-character voices, reading/listening mode, speed control) is implemented. Speech-to-text (recording, transcription, pronunciation feedback) and listening challenges are not started (README roadmap §12).

Related: [plan-management.md](./plan-management.md) (the free-plan token budget does **not** cover TTS calls — see Open questions), [frontend-localization.md](./frontend-localization.md) (per-character description strings), [schema tenancy](../architecture/schema-tenancy.md) (generic `settings` key/value store used for the new preferences).

## Context

Learners read Chinese but the app had no audio. Two related needs drove this feature across several iterations:

1. Give every AI chat reply (Teacher Wang, Xiao Ming, challenge characters) a played-back voice, distinct per character.
2. Let the learner tune how listening fits their study style: normal reading with optional audio, or an audio-first "listening" mode that hides the text until revealed, plus a speed knob relative to their HSK level.

Constraints:

| Topic | Answer |
| --- | --- |
| Provider | OpenAI TTS (`tts-1` model), reusing the same API key as chat (`LLM_API_KEY`) |
| Who calls it | Only the frontend, per message, on demand — not batch-generated server-side |
| Cost control | No dedicated token/cost budget wired up yet (see Open questions) |
| Voice selection | Fixed per character (not user-selectable), picked once when the character was created |
| Speed | Derived, not literal client input — HSK level sets a baseline, a user preference nudges it |

## Options considered

| Option | What it is | Outcome |
| --- | --- | --- |
| **A. One shared voice for every character** | Single `voice="alloy"` for all TTS calls | Rejected — flattens characters that are meant to read as a distinct person (waitress vs. taxi driver, etc.) |
| **B. Per-character fixed voice, chosen at creation time** | Each `ChatCharacter` carries a `gender` + one of the 6 OpenAI voices, hardcoded in `chatCharacters.ts`/`challenges.ts` | **Chosen** |
| **C. Random voice per message** | Pick a voice per TTS call | Rejected — inconsistent voice across a single character's replies |
| **D. Client-supplied arbitrary speed** | Learner sends a raw playback rate | Rejected — replaced by two composable, validated inputs (an HSK-derived base + a bounded adjustment) |
| **E. Fold TTS into `POST /chat`, generating audio for every reply server-side** | One combined call | Rejected — couples an unrelated external call to the main chat latency/cost path; lazy per-bubble fetch from the frontend is cheaper and keeps `/chat` fast |

## Decision

### Backend: `POST /chat/tts`

`backend/routes/chat.py` — given `{ "text": "...", "voice": "alloy"|"echo"|"fable"|"onyx"|"nova"|"shimmer" }` (validated against `TTS_VOICES`), calls `get_openai_client().audio.speech.create(model="tts-1", voice=..., input=text, speed=..., response_format="mp3")` and streams back `audio/mpeg`.

`speed` is never client-supplied. It is computed server-side as:

```
speed = get_chat_tts_speed(user_id) + get_chat_listen_speed_adjustment(user_id) / 100
```

- `get_chat_tts_speed` (`backend/utils/knowledgeBase/hsk_level.py`) maps the learner's chat-speaking HSK level — the same level the chat agent already speaks at, `get_chat_speaking_hsk_level` — to a base speed: 0.75 at HSK1 up to 1.1 at HSK6+ (`tts_speed_for_hsk_level` / `TTS_SPEED_BY_HSK_LEVEL`).
- `get_chat_listen_speed_adjustment` (`backend/utils/database/settings.py`) is a per-user preference, one of `-20/-10/0/10/20` (percent), added as a fraction.

### Character voices

`ChatCharacter` (`frontend/src/components/ChatCharacterCard.tsx`) gained `gender: "male"|"female"` and `voice: TtsVoice`. Every character — Teacher Wang, Xiao Ming, and the 12 challenge roles — was assigned one, fixed in `chatCharacters.ts`/`challenges.ts`: male roles draw from `alloy/echo/fable/onyx`, female roles from `nova/shimmer`. The `create-challenge` skill now requires both fields for a new character, and calls out checking gender-agreement in translations (a real miss found for French occupation nouns, e.g. `serveur`→`serveuse`, `chauffeur`→`conductrice`).

Three avatars that had been drawn male for a role later assigned female (librarian, interviewer, landlord) were regenerated via the `generate-dicebear-avatar` skill; that skill also gained a banned hair-variant list (`variant61`–`63`, found to render badly).

### Preferences: `/preferences/chat-setup`

Two new per-user settings in the generic `settings` key/value store (`backend/utils/database/settings.py`):

| Setting | Values | Default |
| --- | --- | --- |
| `chat_listening_mode` | `reading_first` \| `listening_first` | `reading_first` |
| `chat_listen_speed_adjustment` | `-20` / `-10` / `0` / `10` / `20` | `0` |

`GET`/`PATCH /preferences/chat-setup` (`backend/routes/chat_setup_preference.py`) reads/writes both (a `PATCH` body may update either or both). The Preferences page's "Chat setup" section (placed after Anki sync) exposes two explicit radio cards spelling out the reading-first/listening-first trade-off, and a 5-step slider for the speed adjustment.

### Frontend playback (`ChatModal.tsx`)

- `isChineseOnlyText` (`utils/aiChat/chineseText.ts`) gates which assistant messages get a listen control — pure-Chinese replies only; a mixed-language reply (e.g. an English grammar explanation) gets no button.
- The listen button lives **inside** the message bubble, at the end of the text. Clicking it lazily triggers `POST /chat/tts` for that bubble if not already cached — this also covers messages loaded from history, not just fresh replies — and plays as soon as the response arrives; a loading spinner replaces the icon while the call is in flight. Fetched audio is cached as an object URL for the conversation's lifetime and revoked on unmount / character switch.
- Freshly-received replies eagerly pre-fetch audio in the background (silently, no autoplay), so the button is usually already loaded by the time the learner clicks it.
- In `listening_first` mode: the reply text renders CSS-blurred behind an eye ("reveal") button; the listen button stays visible next to it so both controls are reachable while the text is masked. Audio for a fresh reply autoplays as soon as it's fetched. Reveal is per-message and permanent once clicked; both the mask and the audio cache reset when the conversation/character changes.

## Out of scope (remaining)

- STT: recording the learner's voice, transcribing it to text within a conversation, analyzing pronunciation (README roadmap §12).
- Listening challenges (a dedicated exercise type).
- Token/cost accounting for TTS calls — unlike chat LLM calls, `/chat/tts` is not gated by `plan`/`available_token` (see [plan-management.md](./plan-management.md)).
- User-selectable voice (voice is fixed per character, not a learner preference).
- Playback controls beyond a single restart-on-click — no stop button, no queue; a second click restarts from the top.

## Consequences

### Advantages

- Per-character voice keeps the roster feeling distinct without any new backend state (voice is static frontend data, not stored per user).
- Speed composition (HSK base + bounded adjustment) reuses the level the chat agent already speaks at, so listening pace matches reading pace by default.
- Lazy, per-bubble fetch keeps `/chat/tts` cheap and simple — no batch generation, no server-side audio storage.
- The masking/reveal + listen-button pattern is opt-in (`reading_first` is the default) and changes nothing for learners who don't touch the new preference.

### Drawbacks / follow-ups

- TTS calls have no budget/cost gate — a very active listening-first user could generate many OpenAI TTS calls with no cap (see Open questions).
- No caching across sessions or users: the same assistant sentence is re-synthesized every time a different conversation (or a reloaded page) needs it — object URLs live only for the mounted `ChatModal`, nothing is persisted.
- Voice assignment is entirely manual/static; adding a new challenge character requires a human (or the `create-challenge` skill) to pick a plausible voice — there is no runtime gender inference.
- `isChineseOnlyText` is a blunt gate — a reply that's mostly Chinese with one stray Latin character or digit gets no listen button at all.

## Open questions for a future revision

1. Should `/chat/tts` be covered by the same free-plan budget as chat (README roadmap §8 / [plan-management.md](./plan-management.md)), or get a separate cap?
2. Should generated audio be cached server-side (e.g. by a `(text, voice, speed)` hash) to avoid re-synthesizing identical sentences?
3. What does STT look like — a new endpoint wrapping OpenAI's transcription API? Where does pronunciation-quality feedback come from — a separate LLM judge call, similar to the existing grammar checker?
4. Should `listening_first` eventually extend to `[[stage direction]]` segments, or stay scoped to plain Chinese-only bubbles as today?
