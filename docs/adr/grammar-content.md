# Grammar Content Architecture

## Status

Accepted

The content pipeline described here (repo → S3 → `grammar_points` /
`grammar_prerequisites`) is implemented. The frontend has a Grammar tab
listing grammar points (`GET /grammar-points`, Postgres-only: hsk_level,
title, prerequisites, and the current user's status from
`user_grammar_progress`). Explanation rendering from S3, exercises, and
AI-powered practice are not yet built (README roadmap §10).

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

Grammar content is primarily educational content, while learner progress and
application state are runtime data.

Storing all grammar content in PostgreSQL would make content editing and
versioning unnecessarily coupled to the application database. Conversely,
storing learner progress in S3 would make querying and updating user state
unnecessarily difficult.

The application therefore needs a clear separation between content storage
and application state.

## Decision

### 1. Content is stored in a dedicated Git repository and deployed to S3

[teacher-wang-grammar](https://github.com/mazarsju/teacher-wang-grammar) is a
dedicated repository containing all Teacher Wang grammar content:

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

Git is the source of truth for content. S3 is the runtime distribution
layer. Content deployment is a command-line sync (see that repo's README):

```bash
aws s3 sync grammar/ "s3://<grammar-content-bucket>"
```

This keeps educational content independently versioned from the application
repository (`teacher-wang-app`).

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

`id` is `hskX_topic_name`, must be unique across the whole content repo, and
is what other grammar points reference in their `prerequisites` list — not a
folder path or title. This is enforced by that repo's AGENTS.md and its
`scripts/validate_grammar.py` sanity check, and it's what the loader below
resolves prerequisites against.

The metadata stays small and machine-readable. The full pedagogical
explanation is stored separately in `explanation.md`.

### 3. Grammar explanations are Markdown content

Each grammar point has an `explanation.md` file. Markdown is used because it:

- is easy to edit;
- works naturally with Git;
- is human-readable;
- can be rendered by the frontend;
- allows richer explanations without expanding the database schema.

The application will retrieve the Markdown content from S3 when displaying
a grammar lesson (not yet built — see Status).

### 4. Exercises are content and stored in S3

Deterministic exercises are stored in `exercises.json`, one file per grammar
point covering all its exercise types, ordered by pedagogical progression
(not randomized):

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
  }
]
```

The initial exercise types are `multiple_choice`, `sentence_reordering`, and
`translation` (a `transform` type is also defined in the content repo's
authoring skill for grammar that transforms an existing sentence — negation,
questions, aspect). The schema stays extensible for future exercise types.

### 5. Translation exercises use AI only when deterministic validation is insufficient

Translation exercises are English → Chinese, with one or more accepted
answers per exercise (as above).

The application should first perform deterministic validation (exact match
against `accepted_answers`). If the user's answer doesn't match but may
still be valid, the application can invoke an LLM to evaluate it. This
avoids unnecessary LLM calls for straightforward correct/incorrect answers
while supporting legitimate variation in Chinese.

### 6. AI-generated exercises are a separate concern

Static deterministic exercises are content and therefore live in Git/S3.
AI-generated exercises are runtime objects and don't need to be persisted as
canonical content:

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

If generated exercises are later persisted, they should be treated as
learner/runtime data rather than modifying the canonical content files.

### 7. PostgreSQL stores application metadata and learner state

PostgreSQL doesn't contain the full grammar content — only the metadata
needed for application queries and learner state (`backend/utils/database/models.py`):

```text
grammar_points
--------------
id           "{hsk_level}|{title}", e.g. "1|Basic Sentence Structure"
hsk_level
title
s3_key       the rule's folder key, e.g. "hsk1/01-basic-sentence-structure"
```

`grammar_points.id` is a composite of `hsk_level` + `title`, matching the
existing `HskWord.id` convention elsewhere in the schema — it is **not** the
content repo's `grammar.yaml` `id` field. That yaml `id` exists only to let
`prerequisites` cross-reference other grammar points within the content
repo; the loader resolves it to the composite DB id at reload time.

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
user_id            FK -> users.shortid
grammar_id         FK -> grammar_points.id
status
score
last_practiced_at
```

Exercise attempts and other learning analytics can be added there as the
feature evolves. Full table/partition layout:
[schema tenancy](../architecture/schema-tenancy.md).

### 8. Curriculum ordering is separate from prerequisites

Grammar points must not contain a `difficulty_order` field. There are two
distinct concepts:

- **Curriculum order** — in what order should the application normally
  present grammar points?
- **Prerequisites** — which grammar points should be understood before this
  one?

Today, curriculum order is implicit in each folder's numeric prefix
(`01-basic-sentence-structure`, `02-questions-with-ma`, ...) — no separate
ordering file exists yet. If curriculum order needs to be reorganized
independently of folder names, a dedicated file (e.g. a `curriculum.yaml`
per HSK level listing ids in order) should hold it, rather than adding an
ordering field back into each `grammar.yaml`.

Prerequisites remain part of each grammar point's own metadata:

```yaml
prerequisites:
  - hsk1_basic_sentence_structure
```

This avoids duplicating ordering information and lets the curriculum be
reorganized without touching every grammar definition.

## Runtime Architecture

```text
                  Git (teacher-wang-grammar)
                   │
                   │ aws s3 sync
                   ▼
                  S3 (GRAMMAR_CONTENT_S3_BUCKET)
                   │
                   │ POST /admin/grammar/reload (admin only)
                   │ grammar_content_loader.py: parses every grammar.yaml,
                   │ clears and repopulates grammar_points /
                   │ grammar_prerequisites in one pass
                   ▼
React frontend ◄── Flask backend
      │                │
      │                ├── PostgreSQL
      │                │     ├── grammar_points / grammar_prerequisites
      │                │     └── user_grammar_progress
      │                │
      │                └── AI services (translation validation, future
      │                     AI-generated exercises)
      │
      └── exercise interaction, explanation rendering (S3 fetch)
```

`GRAMMAR_CONTENT_S3_PATH` can point at a local `teacher-wang-grammar`
checkout instead, so reload can be tested without S3/AWS credentials
(`backend/utils/grammar/grammar_content_loader.py`).

The reload is a full clear-and-repopulate, not an incremental upsert: any
malformed or invalid `grammar.yaml` (parse error, missing/duplicate `id`,
unresolved `prerequisites` entry) aborts the whole reload rather than
partially applying it, so `grammar_points`/`grammar_prerequisites` are never
left half-updated.

The backend owns application state and the content layer; the frontend
renders the learning experience and deterministic exercise interactions.

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
- Content schemas need validation to prevent malformed YAML/JSON from
  reaching production — partially addressed today by the content repo's
  `scripts/validate_grammar.py` (id/prerequisite syntax) plus the loader's
  own fail-fast checks (YAML parse errors, missing/duplicate `id`, unknown
  `prerequisites` all abort the reload instead of silently corrupting data).
- Changes to the content schema may require coordination between the
  content repository and application code.

## Content Generation

Grammar content is generated and maintained using an AI-agent skill stored
in the content repository
(`teacher-wang-grammar/.claude/skills/create-grammar-topic`). The skill lets
an agent:

- Generate a new grammar point.
- Determine the next grammar point from the existing curriculum.
- Generate `grammar.yaml`.
- Generate `explanation.md`.
- Generate `exercises.json`.
- Generate additional exercises for an existing grammar point.
- Avoid duplicate exercises.
- Continue exercise IDs correctly.
- Respect existing grammar-point conventions and prerequisites, and run the
  repo's sanity checks (YAML parses, `id`/`prerequisites` syntax) before
  finishing.

This makes the content repository the primary working environment for
curriculum creation, keeping the application repository focused on product
implementation.

## Future Evolution

The content model can later be extended with:

- Audio assets
- Images
- Additional exercise types
- AI exercise-generation templates
- Richer mastery models
- Grammar-to-vocabulary relationships
- Grammar-aware AI conversations
- Personalized grammar recommendations

These additions should preserve the fundamental separation between
canonical educational content and learner/application state.
