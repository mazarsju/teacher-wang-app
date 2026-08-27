# Writing Practice Architecture

## Status

Accepted

Writing topics appear inline in the Grammar tab's lesson list (`frontend/src/pages/GrammarPage.tsx`), not as a separate top-level nav item: `GET /grammar-points` returns `writing_practices` (`{id, title, after_grammar_point}[]`, read from the `writing_practice` Postgres table — see decision 1) alongside `grammar_points`, and each entry is inserted as a "Practice: `<title>`" row immediately after the grammar lesson whose id matches `after_grammar_point`, with a pen icon in place of the usual lesson number. Clicking it sets `selectedWritingTopicId` and renders `<WritingPracticeDetailPage topicId onBack>`.

That page has up to three tabs, `context`, `writing`, and `completed` (`frontend/src/pages/WritingPracticeDetailPage.tsx`). On mount it makes one call, `GET /writing-practice/<topic_id>`, for the topic's `title`, `context`, `draft`, and `archive` (decisions 1 and 10). **Context** renders `context` as Markdown, describing the prompt and which grammar patterns to use. **Writing** holds a full-width textarea, pre-filled with any previously saved `draft`; a "Save draft" button calls `POST /writing-practice/<topic_id>` to persist the current text, and the same save fires automatically on Submit and after every sentence correction is saved (see decision 6). A "Delete draft" button next to it — confirmed via `ConfirmModal` since it's destructive — clears the draft the same way (an empty-string save) and resets the page to a blank textarea, without touching the topic's `archive`. **Completed versions** only appears once the topic's `archive` array is non-empty; it lists every past fully-correct submission as a collapsible `<details>` entry titled by its completion timestamp, most-recent first and expanded by default (see decision 7).

Clicking **Submit** first calls `POST /writing/check-topic-relevance` with the whole draft and the topic's prompt (decision 8); if the text doesn't address the topic, a `WarningModal` explains that and the textarea is left untouched — none of the per-sentence flow below runs. If it's on topic (or the check itself fails — see decision 8), Submit splits the draft into sentences client-side (decision 2), swaps the textarea for a read-only per-sentence render, and checks each sentence **sequentially**:

1. `POST /writing/check-sentence` — grammar correctness (decision 3).
2. If that came back clean, `POST /grammar-points/check` with `check_only: true` — which of the learner's in-progress grammar points this sentence uses, **without** recording anything yet (decision 4).

Once every sentence has settled, a `WritingReviewModal` opens: if every sentence's severity is `"none"`, it plays the same completion confetti as a challenge and lists the grammar points used; otherwise it explains that some sentences still need fixing and lists whatever was already detected. Dismissing an all-correct modal wipes the draft and puts the page back in edit mode (empty textarea) so the learner can start a new attempt; dismissing a still-has-mistakes modal leaves the reviewed, colored sentences on screen so they can keep fixing them. Clicking a flawed sentence opens an ephemeral Teacher Wang chat seeded with the correction's explanation (decision 5); the pencil icon next to it opens `SentenceCorrectionModal` to edit the sentence in place, which re-runs the same two-step check and re-evaluates whether the whole text is now correct. The moment it is, `POST /grammar-points/record-usage` fires once with one grammar-id per usage across all sentences (decision 4), and `POST /writing-practice/<topic_id>/complete` archives the fully-correct text (decision 7) — whether that moment is right after Submit or only after the learner fixes the last mistake through the correction modal.

**Not yet wired up**: the `writing_progress` table (`backend/utils/database/models.py`, `WritingProgress`) and its migration exist but nothing reads or writes them — there is currently no persisted score in Postgres for a writing topic, only the draft text and its S3 archive.

## Context

Writing practice needed to:

- Give the learner a free-text prompt tied to a specific point in the grammar curriculum, so it reinforces what they just learned.
- Point out grammar mistakes sentence by sentence, with an explanation the learner can ask follow-up questions about — the same experience chat already gives them for a single message.
- Let the learner fix mistakes in place and re-check, without re-typing the whole text.
- Not credit grammar-point "real-life usage" for a sentence sitting next to three others that are still wrong — mastery should only advance once the learner actually produced a fully correct piece of writing.
- Survive a closed tab: a learner writing several sentences of Chinese should not lose that work by navigating away.

None of this needed new NLP or a new LLM prompt: grammar-correctness checking and grammar-usage detection already existed for chat messages, and per-user blob storage already existed for conversation transcripts. The work was almost entirely about reusing those two things correctly and adding a client-side flow around them.

## Decision

### 1. Writing topics are a Postgres/S3-backed catalog, reusing the grammar-content pipeline

Writing topics used to be a hardcoded frontend array (`frontend/src/data/writingTopics.ts`) plus a static Markdown file per topic (`frontend/src/data/writingContext/<id>.md`) — the same limitation the grammar-content ADR's decision 1 solved for grammar points, now solved the same way here: a `writing_practice` Postgres table (`id`, `title`, `after_grammar_point` FK → `grammar_points.id`) populated by the same `POST /admin/grammar/reload` that populates `grammar_points`, reading every `writing_practice/<name>/overview.yaml` from the grammar-content S3 bucket (see the [grammar content ADR](grammar-content.md), decision 7, and [schema tenancy](../architecture/schema-tenancy.md) for the full schema and reload logic). The topic's prompt text lives in a sibling `context.md`, fetched on demand by `GET /writing-practice/<topic_id>` (`backend/routes/writing_practice.py`) rather than stored in Postgres — the same explanation-content-lives-in-S3 split `grammar_points`/ `explanation.md` already uses.

`GrammarPage.tsx` no longer imports a static array: `GET /grammar-points` returns `writing_practices` alongside `grammar_points` in one call (a `WritingTopic[]` of `{id, title, after_grammar_point}`), and `WritingPracticeDetailPage.tsx` fetches its own `title`/`context` (plus `draft`/`archive` — decision 10) from `GET /writing-practice/<topic_id>` on mount instead of doing a synchronous local lookup — the tradeoff is a network round trip (and a brief loading state) where there used to be none. Adding a topic today is a content change — a new `writing_practice/<name>/overview.yaml` + `context.md` in the content repo, then a reload — not a frontend code change, a migration, or a new endpoint.

### 2. Sentence splitting is a client-side punctuation heuristic

`splitIntoSentences` (`frontend/src/utils/writing/splitSentences.ts`) splits on Chinese (`。！？`) and English (`.!?`) sentence-ending punctuation, grouped by line. This avoids a network round trip (and an LLM call) just to find sentence boundaries, at the cost of false-splitting on abbreviations or decimals — marked with a `ponytail:` comment as a known, accepted limitation rather than solved with a real tokenizer up front.

### 3. Per-sentence correctness reuses the chat grammar-correction agent

`POST /writing/check-sentence` (`backend/routes/check_writing_sentence.py`) is a thin wrapper around `check_user_grammar` (`backend/utils/aiChat/chat_service.py`) — the exact function that produces the "correction" attached to a chat message, with the same severity scale (`none` / `minor` / `awkward` / `incorrect`) and Teacher-Wang-voiced `answer` explanation. No new prompt was written for writing practice; a sentence submitted here is indistinguishable, prompt-wise, from a message sent in chat.

### 4. Grammar-rule usage is detected per sentence but only recorded once the whole text is correct

Crediting real-life usage sentence-by-sentence, the way chat does via `POST /grammar-points/check`, would let a mostly-wrong paragraph advance a grammar point toward `MASTERED` on the strength of one lucky sentence. Writing practice instead splits detection from recording:

- `POST /grammar-points/check` with `"check_only": true` (`backend/routes/check_grammar_point.py`) — runs the same `check_grammar_usage` LLM check against the learner's `DONE` grammar points and returns which are covered, **without** touching `user_grammar_progress`. `check_only` is a parameter on the existing chat-facing route, not a separate endpoint: both branches share the same query and LLM call, and diverge only after `check_grammar_usage` returns (`check_only` returns `{id, title}` pairs and stops; the default path additionally increments `usage_in_real_life`, applies `MASTERED`-at-3, and commits). A prior version of this route split detection into its own `POST /grammar-points/detect` endpoint; that duplicated the query/LLM-call code across two routes for no benefit `check_only` doesn't already give, so it was folded back in.
- `POST /grammar-points/record-usage` (`backend/routes/record_grammar_usage.py`) — takes a flat list of grammar-ids, one entry per usage (not deduplicated), and applies the same increment/`MASTERED`-at-3 logic the non-`check_only` path applies inline. This stays a separate endpoint rather than folding into `/grammar-points/check` too: it has no text to run the LLM against, only ids a caller already decided are usages.

The frontend accumulates detected grammar points per sentence in local state (`WritingSentenceCheck.grammarPointsCovered`) and only calls `record-usage` once every sentence's severity is `"none"` — whether that happens right after Submit or only after the learner fixes the last mistake through the correction modal. Chat's call to `POST /grammar-points/check` is untouched (it omits `check_only`, so it defaults to `false` and behaves exactly as before).

### 5. Mistake explanations and corrections reuse existing chat/modal patterns

Clicking a flawed sentence opens an ephemeral `ChatModal` scoped to that sentence — the same "ask Teacher Wang" pattern already used from the grammar lesson detail page, seeded with the correction's `answer` as a scripted opening message (no `/chat` call for the explanation itself, only for a learner follow-up question) and a `topicContext` describing the mistake. Editing a sentence opens `SentenceCorrectionModal`, a plain pre-filled text field; saving it re-runs the same check-sentence → `grammar-points/check` (`check_only`) pipeline used for the initial submission rather than a separate "re-check" code path.

### 6. Drafts are a JSON blob in the existing conversation-logs S3 bucket

Writing drafts reuse `conversation_log_storage.get_storage()`/`object_key()` (`backend/utils/aiChat/conversation_log_storage.py`) — the same local-filesystem/S3 backend switch and bucket (`CONVERSATION_LOGS_S3_BUCKET` in prod) already used for chat transcripts — rather than a new bucket, a new env var, or a Postgres table:

```text
users/{sub}/writing/{topic_id}.json
{ "draft": "<current draft text>", "archive": [] }
```

`backend/utils/writing/writing_drafts.py` (`load_draft`/`save_draft`) reads and writes that JSON directly; `save_draft` always preserves whatever is already in `archive` and only overwrites `draft`. Being under the same `users/{sub}/` prefix, a draft is also deleted by `DELETE /database/knowledge-base`'s existing prefix wipe, with no extra code. Full layout: [conversation logs](../architecture/conversation-logs.md).

The frontend calls `saveWritingDraft` (not just from the "Save draft" button) on Submit and again after every sentence correction is saved, each time with the current full text reassembled from the sentence checks — so a closed tab loses at most the in-flight review, not the corrections already applied. Every one of these calls is fire-and-forget (`.catch(() => {})`): a failed autosave doesn't block or interrupt the review flow the way a failed explicit "Save draft" click does. Closing the review modal after a fully-correct submission saves an empty draft the same way, clearing the textarea for a new attempt now that the text has been archived.

"Delete draft" reuses this same empty-string save rather than a dedicated delete endpoint or `ConversationLogStorage.delete` — from the frontend's point of view, "no draft" and "an empty draft" are the same state, and the existing route already round-trips `archive` untouched. A no-op backend change; the only new pieces are the button (`kind="danger"`) and a `ConfirmModal` confirmation, matching the delete-word pattern in `KnowledgeBasePage.tsx`.

### 7. Completion archives the text; `archive` entries are `{timestamp, content}`

`complete_draft` (`backend/utils/writing/writing_drafts.py`) is `save_draft` with one difference: instead of overwriting `archive`, it appends `{"timestamp": <ISO 8601 UTC>, "content": <text>}` to it and sets `draft` to that same text. It's called through `POST /writing-practice/<topic_id>/complete` at the exact moment the frontend would otherwise call `recordGrammarUsageIfAllCorrect` — i.e. once every sentence in the text has severity `"none"` — so a submission only gets archived when a real fully-correct piece of writing was produced, same guard as decision 4's usage recording. Both calls read the same "is everything correct" condition independently; there's no shared endpoint because one writes Postgres and the other writes S3.

Archiving is also fire-and-forget: the review modal already told the learner they succeeded, so a failed archive call shouldn't surface as an error on top of that. On success the frontend replaces its local `archive` state with the response's `archive` array (rather than appending its own guess of the entry), which is what makes the "Completed versions" tab appear immediately without a page reload.

### 8. On-topic gating is a new LLM check, run once per Submit, fail-open

Grammar correctness (decision 3) says nothing about whether a sentence is *relevant* — "你好！" is grammatically fine but doesn't answer a "present yourself" prompt. `check_writing_topic_relevance` (`backend/utils/aiChat/chat_service.py`) is a new LLM call (no existing function covered this) that takes the raw text and a `topic` string and returns a single `on_topic` boolean, exposed as `POST /writing/check-topic-relevance` (`backend/routes/check_writing_topic_relevance.py`). It runs once against the whole draft, before sentence splitting — unlike decisions 3/4, which are deliberately per-sentence, "does this answer the prompt" is a whole-text judgment that a per-sentence pass can't make (a single on-topic sentence buried in three off-topic ones shouldn't pass either, and this check doesn't try to draw that line — it's a coarse yes/no gate, not part of the per-sentence severity model).

The `topic` argument is the frontend's already-fetched `context` from `GET /writing-practice/<topic_id>` (falling back to the topic's `title` if `context` is null) — the same text rendered in the Context tab (decision 1). The route itself does no catalog lookup of its own for this check; it just forwards whatever `topic` string the frontend sends, the same way decision 6's `topic_id` charset check accepts what it's given without validating against a catalog.

The check is fire-open on failure: a thrown error (network, LLM, 500) is caught and swallowed, and Submit proceeds to the normal review flow exactly as if the text had passed. An outage in this gate should degrade to "no gate", not to "the learner can no longer submit writing practice" — the per-sentence grammar/usage checks after it are the features that actually matter.

### 9. Per-sentence checks stay sequential — deliberately, not a missing optimization

Submit checks sentences one LLM round trip at a time (decision 3/4) instead of firing them all at once or batching them into a single call. This is a choice, not something left for later, for two reasons:

- **Incremental feedback.** A learner watches each sentence resolve and turn green/red as it finishes, instead of staring at "under review" for the entire duration of the longest submission. On a long piece of writing, sequential checking is the difference between seeing progress after a few seconds and seeing nothing until everything is done.
- **Load control.** Firing N LLM calls concurrently per Submit multiplies worst-case backend/LLM load by however long a submission is; sequential keeps one writing-practice submission's concurrency the same as one chat message's, regardless of how many sentences it contains.

Batching every sentence into one LLM call would dodge both the latency *and* the concurrency cost, but was rejected for the same reason as decision 2's heuristic splitter: it would trade the sentence-by-sentence progressive coloring (and per-sentence severity/answer) for a single round trip, which is a worse learner experience even though it's faster.

### 10. `GET/POST /writing-practice/<topic_id>` is one endpoint for a topic's title, context, draft, and archive

Fetching a writing-practice topic used to take two calls: `GET /writing-practice/<topic_id>` for `title`/`context` (decision 1) and `GET /writing/draft/<topic_id>` for the learner's `draft`/`archive` (decision 6) — a narrower name from when it only did the latter. They're now one endpoint: `GET /writing-practice/<topic_id>` returns all four fields in a single response, and the save/archive routes moved onto the same base path (`POST /writing-practice/<topic_id>` and `.../complete`). `writing_draft.py` is gone; its three routes and the old `get_writing_practice.py`'s one route now live together in `backend/routes/writing_practice.py`.

The response also drops `id` and `after_grammar_point`, which the old `GET /writing-practice/<topic_id>` returned but nothing read: the frontend already has `topicId` as a prop, and `after_grammar_point` is only needed for lesson-list placement, which `GET /grammar-points`'s `writing_practices` already provides (decision 1). Don't return a field with no reader just because the underlying row has it.

`load_draft`/`save_draft`/`complete_draft` (`backend/utils/writing/writing_drafts.py`, decisions 6/7) are unchanged — only the route layer moved. The merged GET handler does two independent lookups (`WritingPractice.query.get`, 404s if the topic doesn't exist; and `load_draft`, which returns an empty `{draft: "", archive: []}` rather than 404ing if the learner never saved one) and combines their results; neither function was made aware of the other.

## Runtime Architecture

```text
GrammarPage (Grammar tab)
  │ mount          GET /grammar-points ──► { grammar_points, writing_practices } (Postgres)
  └─ "Practice: <title>" row, placed after after_grammar_point's lesson
        │ click
        ▼
WritingPracticeDetailPage
  │ mount          GET  /writing-practice/<topic_id> ─► { title, context, draft, archive }
  │                                                      (Postgres + S3/local fs, both)
  ├─ Context tab ── renders the fetched `context` as Markdown
  │
  ├─ Writing tab ── textarea pre-filled with the fetched `draft`
  │      │ "Save draft" / Submit /       POST /writing-practice/<topic_id>          ──► S3 (or local fs)
  │      │ sentence correction saved
  │      │ "Submit"
  │      ▼
  │   POST /writing/check-topic-relevance ─► check_writing_topic_relevance (chat_service.py) ─► LLM
  │      │ on_topic === false? ──► WarningModal, stop here
  │      ▼ true (or the check itself failed — fail open)
  │   splitIntoSentences (client-side)
  │      │
  │      ▼ per sentence, sequentially
  │   POST /writing/check-sentence ──────► check_user_grammar (chat_service.py) ──► LLM
  │      │ severity === "none"?
  │      ▼ yes
  │   POST /grammar-points/check ────────► check_grammar_usage (chat_service.py) ──► LLM
  │      (check_only: true)                 (reads user_grammar_progress, DONE only)
  │      ▼
  │   WritingReviewModal (all correct → confetti | some wrong → fix-and-retry)
  │      │ every sentence now "none"
  │      ├──────────────────────────────► POST /grammar-points/record-usage ─► user_grammar_progress
  │      └──────────────────────────────► POST /writing-practice/<topic_id>/complete ─► S3 (archive += entry)
  │
  │   flawed sentence clicked  ──► ephemeral ChatModal (seeded, no extra /chat call)
  │   pencil icon clicked      ──► SentenceCorrectionModal ──► re-run check-sentence + check_only check
  │
  └─ Completed versions tab (only if archive non-empty)
         one <details> per archive entry, newest first, newest expanded
```

## Consequences

### Advantages

- No new LLM prompt, no new correctness model: writing practice inherits chat's grammar-correction quality and voice for free, and any future improvement to `check_user_grammar` improves both surfaces at once.
- No new storage system: drafts ride on the conversation-logs bucket's existing backend switch, local/S3 parity, and cleanup path.
- Mastery can't be gamed by submitting a mostly-wrong paragraph — usage is only ever recorded against a fully correct text.
- Adding a topic is a content change (new S3/local-checkout files + a reload), not a migration, a new endpoint, or a frontend code change.

### Drawbacks

- `splitIntoSentences` is a heuristic and will occasionally mis-split on abbreviations, decimals, or unusual punctuation — accepted as a known limitation (see decision 2), not solved.
- Sentences are checked strictly sequentially, one LLM round trip at a time; a long submission takes noticeably longer to fully review than a single chat message does — an accepted trade-off, not an oversight (see decision 9). Decision 8's topic-relevance check adds one more LLM round trip in front of that, once per Submit click (it isn't re-run when a sentence correction is saved).
- Decision 8's `except:` swallows every exception with no logging. A genuine LLM/network outage degrading to "no gate" is the intended behavior, but a persistent bug in the check itself (a prompt regression, a response-shape mismatch) fails exactly the same silent way — there's no log line or metric anywhere that would distinguish an occasional blip from this endpoint having been broken for weeks.
- There is a completion record in S3 (decision 7) but still no row in Postgres — there's no way to show "you've practiced this topic" or a score anywhere that isn't the topic's own Completed versions tab.
- Decision 7's archive-completion check is a third independent place (alongside the two branches of `POST /grammar-points/check`) that re-derives "is this text fully correct" from the same per-sentence severities, rather than reading it from one shared spot.

## Future Evolution

- Wire up (or remove) the `writing_progress` table — right now finishing a writing topic updates nothing in Postgres; there's no way to show "you've practiced this topic" or a score anywhere outside the current session.
- `POST /writing-practice/<topic_id>` and `.../complete` (decisions 6/10) still only validate `topic_id` with a safe-charset check (`_is_valid_topic_id`, alnum + hyphen) — unlike the merged `GET`, which 404s via `WritingPractice.query.get` (decision 10), these two never check the id is a real row in `writing_practice`. A learner can still save a draft under a made-up `topic_id` that no longer (or never did) correspond to a real topic; adding the same existence check there is the natural next step if this needs tightening.
- Decision 8's on-topic check has no logging on failure (see Drawbacks); adding a log line or metric in the `except` branch would make a silently broken check visible without giving up the fail-open behavior itself.
