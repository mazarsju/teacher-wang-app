# Writing Practice Architecture

## Status

Accepted

Writing topics appear inline in the Grammar tab's lesson list
(`frontend/src/pages/GrammarPage.tsx`), not as a separate top-level nav item:
each entry in `WRITING_TOPICS`
(`frontend/src/data/writingTopics.ts`, an `{ id, title, afterGrammarId }[]`
static array — no database table) is inserted as a "Practice: `<title>`" row
immediately after the grammar lesson whose id matches `afterGrammarId`, with
a pen icon in place of the usual lesson number. Clicking it sets
`selectedWritingTopicId` and renders
`<WritingPracticeDetailPage topicId onBack>`.

That page has up to three tabs, `context`, `writing`, and `completed`
(`frontend/src/pages/WritingPracticeDetailPage.tsx`). **Context** renders a
static per-topic Markdown file from `frontend/src/data/writingContext/`
(one `<topic-id>.md` per topic, bundled at build time via
`import.meta.glob`) describing the prompt and which grammar patterns to use.
**Writing** holds a full-width textarea. On mount the page calls
`GET /writing/draft/<topic_id>` to resume any previously saved draft; a
"Save draft" button calls `POST /writing/draft/<topic_id>` to persist the
current text, and the same save fires automatically on Submit and after
every sentence correction is saved (see decision 6). A "Delete draft"
button next to it — confirmed via `ConfirmModal` since it's destructive —
clears the draft the same way (an empty-string save) and resets the page to
a blank textarea, without touching the topic's `archive`. **Completed versions**
only appears once the topic's `archive` array is non-empty; it lists every
past fully-correct submission as a collapsible `<details>` entry titled by
its completion timestamp, most-recent first and expanded by default (see
decision 7).

Clicking **Submit** splits the draft into sentences client-side
(decision 2), swaps the textarea for a read-only per-sentence render, and
checks each sentence **sequentially**:

1. `POST /writing/check-sentence` — grammar correctness (decision 3).
2. If that came back clean, `POST /grammar-points/detect` — which of the
   learner's in-progress grammar points this sentence uses, **without**
   recording anything yet (decision 4).

Once every sentence has settled, a `WritingReviewModal` opens: if every
sentence's severity is `"none"`, it plays the same completion confetti as a
challenge and lists the grammar points used; otherwise it explains that
some sentences still need fixing and lists whatever was already detected.
Dismissing an all-correct modal wipes the draft and puts the page back in
edit mode (empty textarea) so the learner can start a new attempt; dismissing
a still-has-mistakes modal leaves the reviewed, colored sentences on screen
so they can keep fixing them.
Clicking a flawed sentence opens an ephemeral Teacher Wang chat seeded with
the correction's explanation (decision 5); the pencil icon next to it opens
`SentenceCorrectionModal` to edit the sentence in place, which re-runs the
same two-step check and re-evaluates whether the whole text is now correct.
The moment it is, `POST /grammar-points/record-usage` fires once with one
grammar-id per usage across all sentences (decision 4), and
`POST /writing/draft/<topic_id>/complete` archives the fully-correct text
(decision 7) — whether that moment is right after Submit or only after the
learner fixes the last mistake through the correction modal.

**Not yet wired up**: the `writing_progress` table
(`backend/utils/database/models.py`, `WritingProgress`) and its migration
exist but nothing reads or writes them — there is currently no persisted
score in Postgres for a writing topic, only the draft text and its S3
archive.

## Context

Writing practice needed to:

- Give the learner a free-text prompt tied to a specific point in the
  grammar curriculum, so it reinforces what they just learned.
- Point out grammar mistakes sentence by sentence, with an explanation the
  learner can ask follow-up questions about — the same experience chat
  already gives them for a single message.
- Let the learner fix mistakes in place and re-check, without re-typing
  the whole text.
- Not credit grammar-point "real-life usage" for a sentence sitting next to
  three others that are still wrong — mastery should only advance once the
  learner actually produced a fully correct piece of writing.
- Survive a closed tab: a learner writing several sentences of Chinese
  should not lose that work by navigating away.

None of this needed new NLP or a new LLM prompt: grammar-correctness
checking and grammar-usage detection already existed for chat messages, and
per-user blob storage already existed for conversation transcripts. The
work was almost entirely about reusing those two things correctly and
adding a client-side flow around them.

## Decision

### 1. Writing topics are a static, frontend-only list anchored to a grammar lesson

`WRITING_TOPICS` (`frontend/src/data/writingTopics.ts`) is plain TypeScript
data, not a database table or an API response:

```ts
{ id: "writing-present-yourself", title: "Present yourself", afterGrammarId: "hsk1_existence_with_you" }
```

`afterGrammarId` is a real `grammar_points.id` — `GrammarPage.tsx` inserts
the topic's row into the lesson list right after that grammar point, so the
curriculum placement of a writing topic lives next to the topic definition
itself instead of needing a migration or a reload endpoint. Adding a topic
is a one-line array entry plus a Markdown file in
`frontend/src/data/writingContext/`; no backend change is required to add
one.

### 2. Sentence splitting is a client-side punctuation heuristic

`splitIntoSentences` (`frontend/src/utils/writing/splitSentences.ts`) splits
on Chinese (`。！？`) and English (`.!?`) sentence-ending punctuation,
grouped by line. This avoids a network round trip (and an LLM call) just to
find sentence boundaries, at the cost of false-splitting on abbreviations
or decimals — marked with a `ponytail:` comment as a known, accepted
limitation rather than solved with a real tokenizer up front.

### 3. Per-sentence correctness reuses the chat grammar-correction agent

`POST /writing/check-sentence` (`backend/routes/check_writing_sentence.py`)
is a thin wrapper around `check_user_grammar`
(`backend/utils/aiChat/chat_service.py`) — the exact function that produces
the "correction" attached to a chat message, with the same severity scale
(`none` / `minor` / `awkward` / `incorrect`) and Teacher-Wang-voiced
`answer` explanation. No new prompt was written for writing practice; a
sentence submitted here is indistinguishable, prompt-wise, from a message
sent in chat.

### 4. Grammar-rule usage is detected per sentence but only recorded once the whole text is correct

Crediting real-life usage sentence-by-sentence, the way chat does via the
single `POST /grammar-points/check`, would let a mostly-wrong paragraph
advance a grammar point toward `MASTERED` on the strength of one lucky
sentence. Writing practice instead splits that endpoint's two halves apart:

- `POST /grammar-points/detect` (`backend/routes/detect_grammar_points.py`)
  — runs the same `check_grammar_usage` LLM check against the learner's
  `DONE` grammar points and returns which are covered, **without** touching
  `user_grammar_progress`.
- `POST /grammar-points/record-usage`
  (`backend/routes/record_grammar_usage.py`) — takes a flat list of
  grammar-ids, one entry per usage (not deduplicated), and applies the
  same increment/`MASTERED`-at-3 logic `/grammar-points/check` applies
  inline.

The frontend accumulates detected grammar points per sentence in local
state (`WritingSentenceCheck.grammarPointsCovered`) and only calls
`record-usage` once every sentence's severity is `"none"` — whether that
happens right after Submit or only after the learner fixes the last
mistake through the correction modal. `POST /grammar-points/check` itself
is untouched and still used by chat exactly as before; this is an
additional pair of endpoints, not a replacement.

### 5. Mistake explanations and corrections reuse existing chat/modal patterns

Clicking a flawed sentence opens an ephemeral `ChatModal` scoped to that
sentence — the same "ask Teacher Wang" pattern already used from the
grammar lesson detail page, seeded with the correction's `answer` as a
scripted opening message (no `/chat` call for the explanation itself, only
for a learner follow-up question) and a `topicContext` describing the
mistake. Editing a sentence opens `SentenceCorrectionModal`, a plain
pre-filled text field; saving it re-runs the same
check-sentence → detect-grammar-points pipeline used for the initial
submission rather than a separate "re-check" code path.

### 6. Drafts are a JSON blob in the existing conversation-logs S3 bucket

Writing drafts reuse `conversation_log_storage.get_storage()`/`object_key()`
(`backend/utils/aiChat/conversation_log_storage.py`) — the same
local-filesystem/S3 backend switch and bucket (`CONVERSATION_LOGS_S3_BUCKET`
in prod) already used for chat transcripts — rather than a new bucket, a new
env var, or a Postgres table:

```text
users/{sub}/writing/{topic_id}.json
{ "draft": "<current draft text>", "archive": [] }
```

`backend/utils/writing/writing_drafts.py` (`load_draft`/`save_draft`) reads
and writes that JSON directly; `save_draft` always preserves whatever is
already in `archive` and only overwrites `draft`. Being under the same
`users/{sub}/` prefix, a draft is also deleted by
`DELETE /database/knowledge-base`'s existing prefix wipe, with no extra
code. Full layout: [conversation logs](../architecture/conversation-logs.md).

The frontend calls `saveWritingDraft` (not just from the "Save draft"
button) on Submit and again after every sentence correction is saved, each
time with the current full text reassembled from the sentence checks —
so a closed tab loses at most the in-flight review, not the corrections
already applied. Every one of these calls is fire-and-forget (`.catch(() =>
{})`): a failed autosave doesn't block or interrupt the review flow the way
a failed explicit "Save draft" click does. Closing the review modal after a
fully-correct submission saves an empty draft the same way, clearing the
textarea for a new attempt now that the text has been archived.

"Delete draft" reuses this same empty-string save rather than a dedicated
delete endpoint or `ConversationLogStorage.delete` — from the frontend's
point of view, "no draft" and "an empty draft" are the same state, and the
existing route already round-trips `archive` untouched. A no-op backend
change; the only new pieces are the button (`kind="danger"`) and a
`ConfirmModal` confirmation, matching the delete-word pattern in
`KnowledgeBasePage.tsx`.

### 7. Completion archives the text; `archive` entries are `{timestamp, content}`

`complete_draft` (`backend/utils/writing/writing_drafts.py`) is `save_draft`
with one difference: instead of overwriting `archive`, it appends
`{"timestamp": <ISO 8601 UTC>, "content": <text>}` to it and sets `draft` to
that same text. It's called through
`POST /writing/draft/<topic_id>/complete` at the exact moment the frontend
would otherwise call `recordGrammarUsageIfAllCorrect` — i.e. once every
sentence in the text has severity `"none"` — so a submission only gets
archived when a real fully-correct piece of writing was produced, same
guard as decision 4's usage recording. Both calls read the same "is
everything correct" condition independently; there's no shared endpoint
because one writes Postgres and the other writes S3.

Archiving is also fire-and-forget: the review modal already told the
learner they succeeded, so a failed archive call shouldn't surface as an
error on top of that. On success the frontend replaces its local `archive`
state with the response's `archive` array (rather than appending its own
guess of the entry), which is what makes the "Completed versions" tab
appear immediately without a page reload.

## Runtime Architecture

```text
GrammarPage (Grammar tab)
  └─ "Practice: <title>" row, placed after afterGrammarId's lesson
        │ click
        ▼
WritingPracticeDetailPage
  ├─ Context tab ── static Markdown (frontend/src/data/writingContext/*.md)
  │
  ├─ Writing tab
  │      │ mount                         GET  /writing/draft/<topic_id>          ──► S3 (or local fs)
  │      │ "Save draft" / Submit /       POST /writing/draft/<topic_id>          ──► S3 (or local fs)
  │      │ sentence correction saved
  │      │ "Submit"
  │      ▼
  │   splitIntoSentences (client-side)
  │      │
  │      ▼ per sentence, sequentially
  │   POST /writing/check-sentence ──────► check_user_grammar (chat_service.py) ──► LLM
  │      │ severity === "none"?
  │      ▼ yes
  │   POST /grammar-points/detect ───────► check_grammar_usage (chat_service.py) ──► LLM
  │      │                                  (reads user_grammar_progress, DONE only)
  │      ▼
  │   WritingReviewModal (all correct → confetti | some wrong → fix-and-retry)
  │      │ every sentence now "none"
  │      ├──────────────────────────────► POST /grammar-points/record-usage ─► user_grammar_progress
  │      └──────────────────────────────► POST /writing/draft/<topic_id>/complete ─► S3 (archive += entry)
  │
  │   flawed sentence clicked  ──► ephemeral ChatModal (seeded, no extra /chat call)
  │   pencil icon clicked      ──► SentenceCorrectionModal ──► re-run check-sentence + detect
  │
  └─ Completed versions tab (only if archive non-empty)
         one <details> per archive entry, newest first, newest expanded
```

## Consequences

### Advantages

- No new LLM prompt, no new correctness model: writing practice inherits
  chat's grammar-correction quality and voice for free, and any future
  improvement to `check_user_grammar` improves both surfaces at once.
- No new storage system: drafts ride on the conversation-logs bucket's
  existing backend switch, local/S3 parity, and cleanup path.
- Mastery can't be gamed by submitting a mostly-wrong paragraph — usage is
  only ever recorded against a fully correct text.
- Adding a topic is a data change (array entry + Markdown file), not a
  migration or a new endpoint.

### Drawbacks

- `splitIntoSentences` is a heuristic and will occasionally mis-split on
  abbreviations, decimals, or unusual punctuation — accepted as a known
  limitation (see decision 2), not solved.
- Sentences are checked strictly sequentially, one LLM round trip at a
  time; a long submission takes noticeably longer to fully review than a
  single chat message does.
- There is a completion record in S3 (decision 7) but still no row in
  Postgres — there's no way to show "you've practiced this topic" or a
  score anywhere that isn't the topic's own Completed versions tab.
- `grammar-points/detect` and `grammar-points/check` now both implement the
  "call `check_grammar_usage` against the learner's DONE points" step;
  keeping their prompt/behavior in sync is a shared-code-not-shared-route
  situation rather than one endpoint reused by both callers. Decision 7's
  archive-completion check is a third independent place that re-derives
  "is this text fully correct" from the same per-sentence severities.

## Future Evolution

- Wire up (or remove) the `writing_progress` table — right now finishing a
  writing topic updates nothing in Postgres; there's no way to show "you've
  practiced this topic" or a score anywhere outside the current session.
- Server-side validation of `topic_id` today is only a safe-charset check
  (`_is_valid_topic_id`, alnum + hyphen) — it doesn't confirm the id is one
  of `WRITING_TOPICS`, since that list only exists in the frontend. Adding
  the topic catalog somewhere the backend can see it (or accepting an
  unrecognized topic id as "just a bucket for a draft") is an open
  question if this needs tightening later.
- Parallelizing the per-sentence checks (or batching them into one LLM
  call) would reduce review latency on longer submissions.
