---
name: create-challenge description: >- Adds a new Mandarin role-play challenge (card, chat agent, tasks, judge) to teacher-wang. Use when the user asks to create a challenge, add a challenge scenario, or register a new challenge character with tasks.
---

# Create a challenge

Add a new challenge by wiring one shared `character_id` through backend + frontend. The Challenge section, modal, task checklist, and Challenge Judge already exist — only register the new scenario.

## Required input from the user

Collect these six fields (ask if any is missing):

1. **Challenge name** — short English title for the card / scenario (e.g. `Waitress`)
2. **Person involved** — English name + Chinese name of the role-play agent (e.g. `Waitress` / `服务员`)
3. **Gender** — `male` or `female` for the role-play agent. Ask if not obvious from the role; every character must have one (drives the avatar and the TTS voice — see Derive below)
4. **Situation + agent rules** — brief description of the setting, initial state, and any progression rules (what must happen in which order)
5. **Tasks** — ordered list of actions the learner must accomplish (English labels)
6. **Vocabulary** — 4-10 words/phrases useful for this scenario (e.g. `服务员`, `买单` for the waitress challenge). If the user doesn't supply a list, derive it yourself from the situation and tasks — every challenge must ship with one; don't skip this field.

Derive:

| Field | Rule |
| --- | --- |
| `character_id` | `challenge-<slug>` from the name/person, kebab-case, unique (e.g. `challenge-restaurant`) |
| `avatarVariant` | New short slug if needed (e.g. `waiter`, `cashier`) — add SVG avatar when not reusable, generated to match the stated **gender** (see [generate-dicebear-avatar](../generate-dicebear-avatar/SKILL.md) — no beard + a feminine hair variant for `female`) |
| `voice` (TTS) | Pick **one** voice at creation time and hardcode it (not randomized at runtime): `male` → randomly one of `alloy`, `echo`, `fable`, `onyx`; `female` → randomly one of `nova`, `shimmer`. This is the voice sent as the `voice` param to `POST /chat/tts` whenever this character's reply is spoken aloud |
| Task `id`s | kebab-case from the label, unique within the challenge (e.g. `call-waiter`) |
| Vocabulary word `id`s | kebab-case pinyin-derived slug, unique within the challenge (e.g. `maidan` for 买单) |
| Vocabulary `pinyin` | space-separated syllables with numeric tones (e.g. `mai3 dan1`), matching the app's pinyin convention |
| Card `description` | One short sentence from the situation (what the learner practices) |

## Mandatory agent behavior (every challenge)

Shared Mandarin / `[[...]]` / progression rules live in `backend/challenge_prompts.py` (`build_challenge_system_prompt`). **Do not** paste those paragraphs into each new challenge — fill a `ChallengeScenario` instead; the builder injects:

- Speak **only Chinese** (except English stage-direction blocks inside `[[...]]`).
- Answer **only** the learner’s questions / turns (no unsolicited follow-ups).
- Strict ordered progression; refuse out-of-order requests in Chinese.
- Situations use **double square brackets** only:
  - Simple situation: `[[<situation>]]`
  - Leave form: `[[<agent leaves>]][[<next action>]]<plain Chinese sentence>`
  - Never single brackets `[...]` for situations.

The frontend finds every `[[...]]` anywhere in an assistant message and renders each as an italic stage line (plain text outside brackets still shows as a normal bubble). Keep that contract.

## Checklist

Copy and track:

```
Challenge Progress:
- [ ] Scenario config in challenge_prompts.py (+ CHALLENGE_SCENARIOS map)
- [ ] Backend chat agent in chat_agents.py (uses builder output)
- [ ] Backend tasks in challenges.py (same ids/labels as frontend)
- [ ] Frontend challenge template in data/challenges.ts (CHALLENGE_TEMPLATES), incl. vocabulary, gender, voice
- [ ] Translations in locales/en/challenge.json + fr/challenge.json (title/description/tasks/vocabulary), gender-agreement checked in every language (see 3b)
- [ ] Avatar variant (reuse, or add SVG matching the stated gender + type unions)
- [ ] Tests updated if needed
- [ ] Remind user to restart backend
```

## Step 1 — Backend challenge prompt + chat agent

### 1a. Scenario config

File: `backend/challenge_prompts.py`

Add a `ChallengeScenario` (and `ChallengeGate`) with only the **scenario-specific** fields — role, initial situation, gate, ordered steps, optional mid-flow tips, leave label/example. Append it to `CHALLENGE_SCENARIOS`.

```python
"<CONST>": ChallengeScenario(
    english_name="a <role>",
    chinese_name="<中文名>",
    role_summary="You work at … and help the learner practice …",
    initial_situation="The learner has just …",
    gate=ChallengeGate(
        wait_bracket="The <agent> needs to be …",
        trigger_examples="你好, …",
        trigger_description="greeted you",
        post_contact_action="welcome them",
        greeting_example="您好，…",
        first_step_never_out_of_order="Greeting you is never out of order …",
    ),
    steps=(
        "the learner must first … (see First contact);",
        "then …;",
        # ...
    ),
    out_of_order_examples="… before …",
    mid_flow_tips=("When they …, respond with …",),  # optional
    leave_agent_label="The <agent> leaves",
    leave_example="[[The <agent> leaves]][[…]]……。",
),
```

Shared style / Mandarin-only / `[[...]]` / leave-form rules are injected by `build_challenge_system_prompt` — do not duplicate them.

### 1b. Register the chat character

File: `backend/chat_agents.py`

```python
"<character_id>": {
    "name": "<English name>",
    "chinese_name": "<中文名>",
    "retry_unknown_characters": True,
    "system_prompt": build_challenge_system_prompt(
        CHALLENGE_SCENARIOS["<character_id>"]
    ),
},
```

Import `CHALLENGE_SCENARIOS` / `build_challenge_system_prompt` if not already imported. `VALID_CHARACTER_IDS` is derived from `CHAT_CHARACTERS` — no separate allow-list edit.

## Step 2 — Backend challenge tasks (for the judge)

File: `backend/challenges.py`

Add the same `character_id` to `CHALLENGES` with **identical** task `id` / `label` pairs as the frontend:

```python
"<character_id>": {
    "title": "<Challenge name>",
    "tasks": [
        {"id": "<task-id>", "label": "<Task label>"},
        # ...
    ],
},
```

The Challenge Judge runs automatically after each chat turn for ids in this map. Progress persists alongside the chat log at `users/{cognito_sub}/<character_id>.tasks.json` (local `CONVERSATION_LOGS_DIR` or S3). A task is marked complete only when the learner attempts it in Chinese **and** the challenge agent accepts / cooperates; refusals do not count.

## Step 3 — Frontend challenge data

Challenges are localized: stable data (ids, Chinese characters, pinyin, avatar variant) lives in `frontend/src/data/challenges.ts`; translatable text (title, description, task labels, vocabulary definitions) lives in `frontend/src/locales/<lang>/challenge.json`, keyed by `translationKey`.

### 3a. Template entry

File: `frontend/src/data/challenges.ts`

Append a `ChallengeTemplate` to `CHALLENGE_TEMPLATES`:

```ts
{
  id: "<character_id>",
  translationKey: "<camelCaseKey>",
  character: {
    id: "<character_id>",
    chineseName: "<中文名>",
    avatarVariant: "<variant>",
    gender: "male" | "female",
    voice: "<alloy|echo|fable|onyx if male; nova|shimmer if female>",
  },
  tasks: [
    { id: "<task-id>", key: "<taskCamelKey>" },
    // ...
  ],
  vocabulary: [
    { id: "<word-slug>", word: "<汉字>", pinyin: "<syllable1 syllable2>", key: "<vocabCamelKey>" },
    // 4-6 entries covering the words most useful for this scenario
  ],
  hskLevel: <number>,
},
```

`getChallenges(t)` renders this into a `Challenge` (resolving `title`/`description`/`character.name`/`character.description`/`tasks[].label`/`vocabulary[].definition` via `t()`) — no separate `Challenge` object or `CHALLENGES` array to hand-write.

### 3b. Translations

Files: `frontend/src/locales/en/challenge.json` and `frontend/src/locales/fr/challenge.json`

Add a `<translationKey>` entry with `title`, `description`, `character.name`, `character.description`, `tasks.<taskCamelKey>`, and `vocabulary.<vocabCamelKey>` (the English gloss/definition for each vocabulary word — one line per word, not a full sentence):

```json
"<translationKey>": {
  "title": "<Challenge name>",
  "description": "<short practice description>",
  "character": { "name": "<English name>", "description": "<same or shorter blurb>" },
  "tasks": { "<taskCamelKey>": "<Task label>" },
  "vocabulary": { "<vocabCamelKey>": "<short English gloss>" }
}
```

Both `en` and `fr` files must get the entry — the app has no fallback locale.

**Gender agreement is mandatory in every language, not just the character's `name`.** Any translated string that refers to the character — `title`, `character.name`, `character.description`, task labels that mention them (e.g. `greetLibrarian`), and vocabulary glosses that name the role itself — must use the grammatically correct gendered form for the stated gender, in every locale, even where English wouldn't normally distinguish. French in particular has many occupation nouns with distinct masculine/feminine forms (`serveur`/`serveuse`, `vendeur`/`vendeuse`, `recruteur`/`recruteuse`, `coiffeur`/`coiffeuse`) and gendered articles even on epicene nouns (`le`/`la bibliothécaire`, `le`/`la propriétaire`); some roles use an altogether different word for the feminine form in French (bus/taxi "chauffeur" → "conductrice"). When unsure of the correct feminine/masculine form in a target language, check rather than guess. Do not default every character to the masculine form.

`ChatPage` already maps `getChallenges(t)` — no page wiring unless the Challenges section is missing.

## Step 4 — Avatar

If `avatarVariant` is new:

1. Extend the union in `frontend/src/components/ChatCharacterCard.tsx` (`avatarVariant`).
2. Extend the union + add an SVG branch in `frontend/src/components/ChatCharacterAvatar.tsx` (same style as existing `teacher` / `friend` / `waiter` faces).
3. Generate the SVG with the [generate-dicebear-avatar](../generate-dicebear-avatar/SKILL.md) skill, matching the character's stated **gender** (e.g. `beardProbability=0` + a feminine hair variant for `female`).

Reuse an existing variant only when the role visually matches — including gender; don't reuse a differently-gendered avatar just because the job title is similar.

## Step 5 — Tests (light touch)

Update or add coverage when practical:

- Frontend: `ChatPage.test.tsx` — new card visible; open modal shows task labels (disabled checkboxes).
- Backend: no new judge tests required if tasks only differ by data; optional route smoke with mocked judge for the new id.

Keep task ids/labels in sync across frontend + `backend/challenges.py`.

## Do not reinvent

Already implemented — do **not** rebuild unless broken:

- Challenges section + `ChallengeCard` on Chat page
- `ChatModal` tasks panel (read-only; ticked by judge via `completed_task_ids`)
- The vocabulary help button + `ChallengeVocabularyModal` on `ChatModal` (renders `vocabulary`, reuses `GrammarVocabularyTab` for the add-to-knowledge-base flow) — a new challenge only needs to supply the `vocabulary` data, not any UI
- Stage directions via `getStageDirectionLines` (`[[...]]` only)
- `judge_challenge_progress` + progress load/save/clear on chat / history / clear
- Grammar check + correction threads for non–Teacher Wang characters

## Reference example

Restaurant waitress (`challenge-restaurant`):

- Person: Waitress / 服务员, gender `female`, voice `nova`
- Progression: call waitress → order → eat → pay (refuse out-of-order)
- Leave form: `[[The waitress leaves]][[...next action...]]您的菜来了。`
- Vocabulary: 服务员 (waitress), 菜单 (menu), 肉 (meat), 买单 (to pay the bill), 好吃 (tasty)
- Files: `challenge_prompts.py` (scenario), `chat_agents.py` (register), `challenges.py`, `frontend/src/data/challenges.ts` (template incl. vocabulary, gender, voice), `frontend/src/locales/{en,fr}/challenge.json` (French: "Serveuse", not "Serveur"), avatar `waiter`

## Done criteria

- Card appears under **Challenges** as `<Name> (<中文名>)` with description
- Opening it chats with the new agent id and shows the task list
- A **Vocabulary** button appears after the task list; it opens a modal listing the challenge's vocabulary (character, pinyin, definition) with the same add-to-knowledge-base / already-known behavior as the grammar vocabulary tab
- Completing tasks in conversation gets them auto-ticked by the judge
- Stage directions render as italic non-bubble lines
- Backend restarted so the new agent loads
