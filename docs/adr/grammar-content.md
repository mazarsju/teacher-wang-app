# Grammar Content Architecture

## Status

Accepted

The content pipeline described here (repo → S3 → `grammar_points` / `grammar_prerequisites`) is implemented. The frontend has a Grammar tab listing grammar points (`GET /grammar-points`, Postgres-only: hsk_level, folder `index` parsed from `s3_key`, title, prerequisites, and the current user's status from `user_grammar_progress`; ordered by HSK level then that folder index, e.g. `hsk1/01-…` before `hsk1/02-…`). The Grammar tab shows points up to one HSK level above the learner's achieved level (the level they are aiming for; capped at the catalog max) and a detail view (`GET /grammar-points/<id>`, `backend/utils/grammar/grammar_content_loader.py:fetch_grammar_content`) that reads `explanation.md`/`exercises.json` from S3 at the point's `s3_key` and renders the Explanation tab as Markdown (reusing the chat agents' `renderFormattedText`, `frontend/src/utils/formatMarkdownText.tsx`). The Explanation tab ends with an "Ask more information to Teacher Wang" button that opens an ephemeral, lesson-scoped chat (see the Multi-Agent Chat ADR's "Ephemeral chat" section). The Exercises tab (`frontend/src/components/GrammarExercises.tsx`) runs the `multiple_choice`, `sentence_reordering`, `transform`, and `translation` exercises one at a time with deterministic grading (exact match, trailing punctuation ignored) and shows a final score. `translation` additionally falls back to an AI check when the exact match fails — see decision 5 below, now implemented. Finishing a quiz calls `POST /grammar-points/<id>/complete`, which sets `status` to `DONE` (score ≥ 80%) or `WIP` (below 80%), plus `score` (rounded percentage) and `last_practiced_at`, on `user_grammar_progress`; `GET /grammar-points` returns that `score` alongside `status` for the list view. Grammar points also loop back into chat: after any Teacher Wang chat reply where the grammar correction agent found no mistake (`correction.severity === "none"`), the frontend calls `POST /grammar-points/check` (`pro` plan only) with the learner's last message; an LLM agent (`check_grammar_usage`, `backend/utils/aiChat/chat_service.py`) checks it against the learner's `DONE` grammar points and increments `usage_in_real_life` for each one it finds used. After 3 real-life uses a point's `status` flips to `MASTERED` (shown with a blue badge/star icon and blue score on the Grammar tab, `frontend/src/pages/GrammarPage.tsx`), and the frontend shows a `GrammarMasteryModal` with the completion confetti listing the newly mastered lesson titles. AI-powered practice and AI-assisted translation validation are not yet built (README roadmap §10).

A third Vocabulary tab (`frontend/src/components/GrammarVocabularyTab.tsx`) lists the grammar point's `new_words` (plain word strings in `grammar.yaml`, stored as-is on `grammar_points.new_words`). `GET /grammar-points/<id>` resolves each word against `hsk_words` server-side (`get_grammar_point.py:_resolve_new_words`, reusing `suggest_hsk_words.serialize_word`), keeping the lowest-level/lowest-frequency row per word — the same shape as `GET /hsk-words/suggestions`. Each row shows a green check (already in the learner's `words` table) or an "Add" button that opens `AddWordModal` in `add` mode pre-filled with the word/pinyin/ definition, matching the Knowledge base's own add-word flow (`POST /words`, auto-creating any missing characters).

## Context

Teacher Wang needs a structured grammar-learning feature consisting of:

- Grammar explanations
- Examples
- Common mistakes
- Deterministic exercises
- Translation exercises with optional AI validation
- AI-powered grammar practice
- Grammar-specific interaction with the Teacher Wang AI agent
- Learner progress and mastery

Grammar content is primarily educational content, while learner progress and application state are runtime data.

Storing all grammar content in PostgreSQL would make content editing and versioning unnecessarily coupled to the application database. Conversely, storing learner progress in S3 would make querying and updating user state unnecessarily difficult.

The application therefore needs a clear separation between content storage and application state.

## Decision

### 1. Content is stored in a dedicated Git repository and deployed to S3

[teacher-wang-grammar](https://github.com/mazarsju/teacher-wang-grammar) is a dedicated repository containing all Teacher Wang grammar content:

```text
teacher-wang-grammar/
└── grammar/
    ├── hsk1/
    │   ├── 01-basic-sentence-structure/
    │   │   ├── grammar.yaml
    │   │   ├── explanation.md
    │   │   └── exercises.json
    │   └── ...
    └── hsk2/
        └── ...
```

Git is the source of truth for content. S3 is the runtime distribution layer. Content deployment is a command-line sync (see that repo's README):

```bash
aws s3 sync grammar/ "s3://<grammar-content-bucket>"
```

This keeps educational content independently versioned from the application repository (`teacher-wang-app`).

### 2. Grammar points are represented by a metadata file

Each grammar point contains a `grammar.yaml` file:

```yaml
id: hsk1_basic_sentence_structure

title: Basic Sentence Structure

hsk_level: 1

prerequisites: []

learning_objectives:
  - Understand the basic sentence structure.
  - Build simple affirmative sentences.

exercise_types:
  - multiple_choice
  - sentence_reordering
  - translation

tags:
  - sentence_structure
  - word_order

examples:
  - chinese: 我喜欢茶。
    pinyin: Wǒ xǐhuān chá.
    english: I like tea.

common_mistakes:
  - incorrect: 喜欢我茶。
    correct: 我喜欢茶。
    explanation: "Chinese normally follows Subject + Verb + Object order."

completion_threshold: 80
```

`id` is `hskX_topic_name`, must be unique across the whole content repo, and is what other grammar points reference in their `prerequisites` list — not a folder path or title. This is enforced by that repo's AGENTS.md and its `scripts/validate_grammar.py` sanity check, and it's what the loader below resolves prerequisites against.

The metadata stays small and machine-readable. The full pedagogical explanation is stored separately in `explanation.md`.

### 3. Grammar explanations are Markdown content

Each grammar point has an `explanation.md` file. Markdown is used because it:

- is easy to edit;
- works naturally with Git;
- is human-readable;
- can be rendered by the frontend;
- allows richer explanations without expanding the database schema.

The application retrieves the Markdown content from S3 when displaying a grammar lesson (see Status).

### 4. Exercises are content and stored in S3

Deterministic exercises are stored in `exercises.json`, one file per grammar point covering all its exercise types, ordered by pedagogical progression (not randomized):

```json
[
  {
    "id": "mcq_001",
    "type": "multiple_choice",
    "question": "Which sentence means 'I like tea'?",
    "choices": ["我喜欢茶。", "我喝茶。", "我有茶。", "我是茶。"],
    "answer": 0
  },
  {
    "id": "reorder_001",
    "type": "sentence_reordering",
    "tokens": ["喜欢", "我", "茶"],
    "answer": ["我", "喜欢", "茶"]
  },
  {
    "id": "tr_001",
    "type": "translation",
    "prompt": "I like tea.",
    "accepted_answers": ["我喜欢茶。"]
  },
  {
    "id": "transform_001",
    "type": "transform",
    "instruction": "Make this sentence negative.",
    "source": "我喜欢茶。",
    "accepted_answers": ["我不喜欢茶。"]
  }
]
```

The exercise types are `multiple_choice`, `sentence_reordering`, `translation`, and `transform` (for grammar that transforms an existing sentence — negation, questions, aspect). `transform` has an `instruction` describing the requested transformation, a `source` sentence to transform, and `accepted_answers` (note: `source`, not `prompt` — `translation` and `transform` use different field names for their source sentence in the content repo). The schema stays extensible for future exercise types.

### 5. Translation exercises use AI only when deterministic validation is insufficient

Translation exercises are English → Chinese, with one or more accepted answers per exercise (as above).

The application first performs deterministic validation (exact match against `accepted_answers`, trailing punctuation ignored). If the user's answer doesn't match, `GrammarExercises` shows "This solution is not the expected one. Checking with Teacher Wang if it is a possible solution. Please wait..." and asks Teacher Wang, via the ephemeral `/chat` path (see the Multi-Agent Chat ADR's "Ephemeral chat" section), whether the answer is also acceptable — a plain-language question engineered to start the reply with `YES`/`NO`, parsed client-side (`parseAiApproval`). `YES` marks the answer correct; `NO` marks it incorrect and keeps that reply so "More explanation" opens pre-loaded with it, with no second API call. This avoids LLM calls for exact matches while supporting legitimate variation in Chinese, and keeps this check out of chat history like the rest of the exercises' AI usage.

### 6. AI-generated exercises are a separate concern

Static deterministic exercises are content and therefore live in Git/S3. AI-generated exercises are runtime objects and don't need to be persisted as canonical content:

```text
grammar.yaml
       +
explanation.md
       +
learner context
       ↓
   LLM exercise generator
       ↓
 generated exercise
```

If generated exercises are later persisted, they should be treated as learner/runtime data rather than modifying the canonical content files.

### 7. PostgreSQL stores application metadata and learner state

PostgreSQL doesn't contain the full grammar content — only the metadata needed for application queries and learner state (`backend/utils/database/models.py`):

```text
grammar_points
--------------
id           "{hsk_level}|{title}", e.g. "1|Basic Sentence Structure"
hsk_level
title
s3_key       the rule's folder key, e.g. "hsk1/01-basic-sentence-structure"
```

`grammar_points.id` is a composite of `hsk_level` + `title`, matching the existing `HskWord.id` convention elsewhere in the schema — it is **not** the content repo's `grammar.yaml` `id` field. That yaml `id` exists only to let `prerequisites` cross-reference other grammar points within the content repo; the loader resolves it to the composite DB id at reload time.

Prerequisites are represented relationally:

```text
grammar_prerequisites
---------------------
grammar_id        FK -> grammar_points.id
prerequisite_id   FK -> grammar_points.id
```

This allows queries such as:

- Which grammar points exist?
- Which grammar points belong to a given level?
- Which prerequisites does a grammar point have?
- Which grammar points are available to this learner?
- Which grammar points remain blocked?

Learner-specific state belongs in PostgreSQL:

```text
user_grammar_progress
---------------------
user_id             FK -> users.shortid
grammar_id          FK -> grammar_points.id
status               TODO | WIP | DONE | SKIP | MASTERED
score
last_practiced_at
usage_in_real_life   times the LLM has confirmed correct real-conversation use
```

`usage_in_real_life` is incremented by `POST /grammar-points/check` (`backend/routes/check_grammar_point.py`) each time the `check_grammar_usage` agent confirms the rule was used in a chat message; `status` moves from `DONE` to `MASTERED` once it reaches 3 — a point already `MASTERED` no longer matches the endpoint's `DONE`-only query, so it can't re-trigger.

Exercise attempts and other learning analytics can be added there as the feature evolves. Full table/partition layout: [schema tenancy](../architecture/schema-tenancy.md).

The same reload also populates a `writing_practice` table, one row per `writing_practice/<name>/overview.yaml` in the bucket (see the [writing practice ADR](writing-practice.md)):

```text
writing_practice
----------------
id                     overview.yaml's own id, e.g. "writing-present-yourself"
title
after_grammar_point    FK -> grammar_points.id
```

This is a shared table (no `user_id`), like `grammar_points` itself, since it's curriculum catalog data rather than learner state — `overview.yaml` plays the same role for a writing topic that `grammar.yaml` plays for a grammar point, and reuses the loader's existing S3-listing/local-checkout code path rather than a second implementation. `GET /grammar-points` returns `writing_practices` alongside `grammar_points` (replacing what used to be a hardcoded frontend array), and `GET /writing-practice/<topic_id>` (`backend/routes/writing_practice.py`) fetches one topic's row plus its sibling `context.md` — the same explanation-content-lives-in-S3 split `fetch_grammar_content` uses for `explanation.md` — alongside the learner's draft/archive for that topic. See the [writing practice ADR](writing-practice.md), decision 1.

A `listening_practice/<hskN>/<name>/overview.yaml` + sibling `text.txt` layout lives in the same bucket, one level down from `grammar/` and `writing_practice/`, populating a `listening_practice` table (`backend/utils/listening/listening_content_loader.py`). Each `overview.yaml` carries `id`, `title`, `hskLevel`, `type` (e.g. `dialog`, `fiction_story`), `topic` (a short content slug, e.g. `family`), and `grammarIds`. It is *not* folded into `reload_grammar_content()`/`POST /admin/grammar/reload` — it's its own `reload_listening_content()`/`POST /admin/listening/reload`, its own clear-and-repopulate pass, triggered by its own admin button — since listening topics aren't part of the grammar/writing curriculum graph the way `writing_practice.after_grammar_point` is (a listening topic's `grammarIds` are validated against `grammar_points` already in the database rather than reloaded together). Because `_load_manifests` matches by filename suffix across the whole bucket rather than a folder prefix, both this loader and the writing-practice one now filter their result to their own prefix (`listening_practice/` / `writing_practice/`) before parsing — without that, a bucket holding both `writing_practice/*/overview.yaml` and `listening_practice/*/overview.yaml` would have either reload try to parse the other's manifests and fail on a missing field. `title`/`type`/`topic` are translated the same way `writing_practice.title` is: an `overview_<language>.yaml` sibling (`fetch_listening_practice_translations`, scoped to the same prefix) supplies whichever of the three fields it has, falling back per-field to the English DB row — read by `GET /listening-practices` (below), not by the reload pass itself. Full schema: [schema tenancy](../architecture/schema-tenancy.md).

Each topic folder also carries `audio.mp3` (the full recording), an `audio/` subfolder of per-sentence clips (`audio-1.mp3`, `audio-2.mp3`, …, one per `breakdown.json` sentence, in order), and `breakdown.json`/`breakdown_<language>.json` (the same transcript-plus-translation-sibling shape `explanation_<language>.md` uses elsewhere in this bucket). None of this is read by the reload pass — it's fetched on demand by `GET /listening-practices/<id>` and its two audio-streaming routes when the learner opens a topic (see [schema tenancy](../architecture/schema-tenancy.md) for the exact endpoints/functions).

`ListeningPage` shows the catalog as a mosaic sorted by `vocabulary_score + grammar_score` (an "overall score" that exists only in the frontend, never persisted, via the same 4-tier `scoreTier` — excellent/good/fair/poor — `ListeningScoreModal` uses for its fit message): each tile's *background* is a soft top-to-bottom gradient from that tier's color (dark green/light green/yellow/red) into the tile's normal surface color, and its score button shows a matching smiley (😄/🙂/😐/🙁) rather than a plain color swatch, so the fit reads at a glance without opening the modal; title and a `type` badge and a `topic` badge sit on top — the two badges each colored by hashing their untranslated value into a fixed palette so the same value always gets the same color across languages and independently of the tile's tier color. Clicking a tile opens `ListeningPracticeDetailPage`, which has four sections: **Listen** (`AudioPlayer` on the full `audio.mp3`, with ±5s skip); **Questions** (`ListeningExercises` — see below); **Shadowing** (one `ShadowingSentence` row per breakdown sentence — its own `AudioPlayer` on that sentence's clip, the Mandarin text blurred behind an eye toggle, and a type-or-record input checked against the sentence with a lenient punctuation/whitespace-insensitive comparison, `matchesSentence.ts`); and **Full text** (the whole `text.txt` blurred behind an eye toggle, with a "Show translation" button revealing the sentences' `translation` fields joined by newline — reusing the same per-sentence data the detail fetch already returned, rather than a second backend field). The record-or-type input's speech-to-text reuses `POST /chat/stt` verbatim (same Whisper call, same free-plan token gating) — no new STT endpoint was added for this. Because a plain `<audio src>` can't carry the app's `Authorization` header, `AudioPlayer` fetches each clip's bytes via `apiFetch` and plays them from a `URL.createObjectURL` blob (lazily, on first play, and cached for replay) rather than pointing at the route URL directly — the same blob-from-fetch pattern `ChatModal` already uses for TTS playback.

**Questions** (`ListeningExercises.tsx`) reads the topic's `exercises` (multiple-choice only — `answer` sent to the client, graded there, same tradeoff `GrammarExercises` already makes for its own exercises) and, unlike `GrammarExercises`'s one-at-a-time flow, renders every question on the page at once — a deliberate presentation difference, not a missing feature: comprehension questions here are short and few, so there's no pacing benefit to hiding them behind a "next" click. A single "Verify" button (disabled until every question has an answer) computes a percentage, shows each choice as correct/incorrect in place, and — same 80% `PASSING_SCORE` threshold and `ChallengeConfetti` component `GrammarExercises` already uses for its own passing score — fires the confetti and calls `POST /listening-practices/<id>/complete` with that score, which the page merges back into its local `status`/`vocabulary_score`/`grammar_score` state so the page reflects `DONE` immediately without a refetch. Changing an answer after verifying clears the shown result (but keeps the selections) until Verify is pressed again.

### 8. Curriculum ordering is separate from prerequisites

Grammar points must not contain a `difficulty_order` field. There are two distinct concepts:

- **Curriculum order** — in what order should the application normally present grammar points?
- **Prerequisites** — which grammar points should be understood before this one?

Today, curriculum order is implicit in each folder's numeric prefix (`01-basic-sentence-structure`, `02-questions-with-ma`, ...) — no separate ordering file exists yet. `GET /grammar-points` exposes that prefix as `index` (parsed from `s3_key`) and returns points ordered by `hsk_level` then `index`. If curriculum order needs to be reorganized independently of folder names, a dedicated file (e.g. a `curriculum.yaml` per HSK level listing ids in order) should hold it, rather than adding an ordering field back into each `grammar.yaml`.

Prerequisites remain part of each grammar point's own metadata:

```yaml
prerequisites:
  - hsk1_basic_sentence_structure
```

This avoids duplicating ordering information and lets the curriculum be reorganized without touching every grammar definition.

## Runtime Architecture

```text
                  Git (teacher-wang-grammar)
                   │
                   │ aws s3 sync
                   ▼
                  S3 (GRAMMAR_CONTENT_S3_BUCKET)
                   │
                   │ POST /admin/grammar/reload (admin only)
                   │ grammar_content_loader.py: parses every grammar.yaml
                   │ and writing_practice/*/overview.yaml, clears and
                   │ repopulates grammar_points / grammar_prerequisites /
                   │ writing_practice in one pass, then rewrites
                   │ user_grammar_progress rows whose grammar_id still
                   │ exists (dropped/renamed ids are discarded)
                   ▼
React frontend ◄── Flask backend
      │                │
      │                ├── PostgreSQL
      │                │     ├── grammar_points / grammar_prerequisites
      │                │     ├── writing_practice
      │                │     └── user_grammar_progress
      │                │
      │                └── AI services (translation validation, future
      │                     AI-generated exercises)
      │
      └── exercise interaction, explanation rendering (S3 fetch)
```

`GRAMMAR_CONTENT_S3_PATH` can point at a local `teacher-wang-grammar` checkout instead, so reload can be tested without S3/AWS credentials (`backend/utils/grammar/grammar_content_loader.py`).

The reload is a full clear-and-repopulate, not an incremental upsert: any malformed or invalid `grammar.yaml` (parse error, missing/duplicate `id`, unresolved `prerequisites` entry) or `overview.yaml` (missing/duplicate `id`/`title`, unresolved `afterGrammarId`) aborts the whole reload rather than partially applying it, so `grammar_points`/`grammar_prerequisites`/ `writing_practice` are never left half-updated.

The backend owns application state and the content layer; the frontend renders the learning experience and deterministic exercise interactions.

## Consequences

### Advantages

- Educational content is independently version-controlled.
- Content changes don't require database migrations.
- Grammar explanations stay easy for humans and AI agents to edit.
- S3 provides inexpensive runtime content storage.
- PostgreSQL stays focused on relational application state.
- Prerequisites can be queried efficiently.
- Exercise definitions can evolve independently from application code.
- New grammar content can be added without modifying the application.

### Drawbacks

- The application has a separate content repository and deployment process.
- The application must handle missing or invalid S3 content gracefully.
- Content schemas need validation to prevent malformed YAML/JSON from reaching production — partially addressed today by the content repo's `scripts/validate_grammar.py` (id/prerequisite syntax) plus the loader's own fail-fast checks (YAML parse errors, missing/duplicate `id`, unknown `prerequisites` all abort the reload instead of silently corrupting data).
- Changes to the content schema may require coordination between the content repository and application code.

## Content Generation

Grammar content is generated and maintained using an AI-agent skill stored in the content repository (`teacher-wang-grammar/.claude/skills/create-grammar-topic`). The skill lets an agent:

- Generate a new grammar point.
- Determine the next grammar point from the existing curriculum.
- Generate `grammar.yaml`.
- Generate `explanation.md`.
- Generate `exercises.json`.
- Generate additional exercises for an existing grammar point.
- Avoid duplicate exercises.
- Continue exercise IDs correctly.
- Respect existing grammar-point conventions and prerequisites, and run the repo's sanity checks (YAML parses, `id`/`prerequisites` syntax) before finishing.

This makes the content repository the primary working environment for curriculum creation, keeping the application repository focused on product implementation.

## Future Evolution

The content model can later be extended with:

- Audio assets
- Images
- Additional exercise types
- AI exercise-generation templates
- Richer mastery models (e.g. usage decay, per-skill breakdown — beyond the current 3-uses-in-chat `MASTERED` threshold)
- Personalized grammar recommendations

These additions should preserve the fundamental separation between canonical educational content and learner/application state.
