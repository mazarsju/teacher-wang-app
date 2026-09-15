# Listening Practice Architecture

## Status

Accepted — the full flow (catalog, progress scoring, comprehension exercises, shadowing) is implemented (README roadmap §12, "Listening challenges").

Related: [grammar-content.md](./grammar-content.md) (the S3 content pipeline this reuses, and `POST /admin/grammar/reload` vs. this feature's own admin reload), [writing-practice.md](./writing-practice.md) (the sibling content-catalog ADR this one parallels — same S3-bucket-as-catalog, Postgres-as-progress split), [voice-interaction.md](./voice-interaction.md) (shadowing reuses `POST /chat/stt` verbatim — same Whisper call, same per-plan token gating, no new STT endpoint), [plan-management.md](./plan-management.md) (the per-plan `available_token` budget that indirectly caps shadowing, since there is no listening-specific quota), [schema-tenancy.md](../architecture/schema-tenancy.md) (full `listening_practice`/`listening_progress` column layout).

## Context

Chat already gave learners spoken audio (TTS) and a way to record and transcribe their own speech (STT — see [voice-interaction.md](./voice-interaction.md)), but both were per-message conveniences inside a conversation, not a dedicated comprehension exercise tied to the HSK curriculum. Listening practice needed to:

- Give learners a graded, HSK-appropriate audio passage (dialog, short story, explanatory text) with a real transcript, not just whatever a chat conversation happened to produce.
- Check comprehension (multiple-choice questions) and pronunciation practice (repeat-the-sentence shadowing) against that passage, using the same "achieved level + 1" visibility rule the grammar and writing curricula already use.
- Avoid building new content infrastructure or a new STT/LLM pipeline — reuse the grammar-content S3 pipeline for the catalog and `POST /chat/stt` for speech input, the same way writing practice reused the chat grammar-correction agent instead of writing a new checker.

## Decision

### 1. Listening topics are a Postgres/S3-backed catalog, reusing the grammar-content pipeline

A `listening_practice/<hskN>/<name>/overview.yaml` (+ sibling `text.txt`) layout lives in the same S3 bucket as `grammar/` and `writing_practice/`, one level down, populating a `listening_practice` table (`backend/utils/listening/listening_content_loader.py`). Each `overview.yaml` carries `id`, `title`, `hskLevel`, `type` (e.g. `dialog`, `fiction_story`), `topic` (a short content slug, e.g. `family`), and `grammarIds`. A `type: dialog` topic's `overview.yaml` can also carry `manName`/`womanName` (the two speakers' Chinese names) — these aren't part of the reload pass or the `listening_practice` table, only read on demand by `fetch_listening_speaker_names` for `GET /listening-practices/<id>` (omitted if the manifest doesn't have them), and shown by `ListeningPracticeDetailPage` above the audio player alongside `man.png`/`woman.png` (woman on the left, man on the right) when the topic's `type` is `dialog`.

It is deliberately **not** folded into `reload_grammar_content()`/`POST /admin/grammar/reload` — it has its own `reload_listening_content()`/`POST /admin/listening/reload`, its own clear-and-repopulate pass, triggered by its own admin button — because listening topics aren't part of the grammar/writing curriculum graph the way `writing_practice.after_grammar_point` is (a topic's `grammarIds` are validated against `grammar_points` already in the database rather than reloaded together, so `POST /admin/grammar/reload` must have run at least once first). Because `_load_manifests` matches by filename suffix across the whole bucket rather than a folder prefix, this loader and the writing-practice one both filter their result to their own prefix (`listening_practice/` / `writing_practice/`) before parsing, so a bucket holding both doesn't have either reload try to parse the other's manifests.

`title`/`type`/`topic` are translated the same way `writing_practice.title` is: an `overview_<language>.yaml` sibling (`fetch_listening_practice_translations`) supplies whichever of the three fields it has, falling back per-field to the English DB row.

Each topic folder also carries `audio.mp3` (the full recording), an `audio/` subfolder of per-sentence clips (`audio-1.mp3`, `audio-2.mp3`, … one per `breakdown.json` sentence, in order), and `breakdown.json`/`breakdown_<language>.json` (transcript + per-sentence translation, same sibling-translation shape used elsewhere in this bucket). None of this is read by the reload pass — it's fetched on demand by `GET /listening-practices/<id>` and its two audio-streaming routes when a learner opens a topic. A plain `<audio src>` can't carry the app's `Authorization` header, so `AudioPlayer` fetches each clip's bytes via `apiFetch` and plays them from a `URL.createObjectURL` blob — the same blob-from-fetch pattern `ChatModal` uses for TTS playback.

A sentence too long to shadow in one breath is split into **chunks**: its `breakdown.json` entry carries an additional `chunks: [{id, mandarin}, ...]` array (in shadow-order), and its clip is authored per chunk instead of whole — `audio/audio-<sentenceId>-<chunkId>.mp3` (e.g. `audio-2-1.mp3` … `audio-2-4.mp3`) instead of a single `audio-2.mp3`. Chunks are never translated separately — `breakdown_<language>.json` only ever carries a per-*sentence* `translate`, so a chunked sentence's translation still comes from its parent entry. `fetch_listening_breakdown` always returns a `chunks` key (empty for a whole-sentence shadow), and `read_listening_audio_segment`/`GET /listening-practices/<id>/audio/<segment>/<chunk>` take an optional chunk id to read the split file instead of the whole-sentence one.

### 2. Visibility and scoring are derived from existing learner state, not from taking the exercise

`_visible_topics` (`backend/utils/listening/listening_progress.py`) scopes the catalog to `hsk_level <= speaking_hsk_level_from_current(...)` — the same "achieved level + 1" rule `GrammarPage` applies to grammar points. `refresh_listening_progress` (called on login, fire-and-forget) recomputes, per visible topic: `vocabulary_score` = percentage of the topic's unique Chinese characters already in the learner's knowledge base; `grammar_score` = percentage of its comma-separated `grammarIds` already `DONE`/`MASTERED` in `user_grammar_progress`. A topic with nothing to cover on an axis scores 100 on it (vacuously complete) rather than 0.

Both scores are a readiness estimate computed from the learner's *existing* vocabulary/grammar mastery — not a result of listening to the audio or answering the questions. This mirrors the "fit" framing `ListeningPage`/`ListeningScoreModal` show: a tile's color and face icon (excellent/good/fair/poor tiers, `scoreTier`, shared with the modal) tell the learner how ready they already are for a topic before they open it, sorted by `vocabulary_score + grammar_score` descending so the best-fit topics surface first. This client-side "overall score" is never persisted as a combined value; only the two source percentages live in `listening_progress`.

### 3. Comprehension questions are ungated, client-graded, and don't affect progress

`ListeningExercises.tsx` reads a topic's `exercises` (`[{id, type: "multiple_choice", question, choices, answer}]`, `answer` sent to the client — same tradeoff `GrammarExercises` already makes) and renders every question at once rather than one-at-a-time — a deliberate difference from `GrammarExercises`'s paced flow, since comprehension questions here are short and few enough that pacing adds no value. A single "Verify" button computes a percentage, colors each choice correct/incorrect in place, and — same 80% threshold and `ChallengeConfetti` component `GrammarExercises` uses — fires confetti and shows pass/fail. This score never reaches the backend and never changes `status`; changing an answer after verifying clears the shown result but keeps selections until Verify is pressed again.

### 4. Shadowing reuses `POST /chat/stt` verbatim; correctness is a lenient string match, not pronunciation scoring

`ShadowingSentence.tsx` is itself unit-agnostic — it takes a `mandarin` string and a `loadAudio` callback, with no notion of sentences, segments, or chunks. `ListeningPracticeDetailPage` does the flattening: it walks `detail.sentences` and, for each one, emits either one shadowing unit (the whole sentence, `loadAudio` hitting `/audio/<sentenceId>`) or — when that sentence's `chunks` array is non-empty — one unit per chunk in `chunks` order (`loadAudio` hitting `/audio/<sentenceId>/<chunkId>`), so a split sentence is shadowed and checked chunk-by-chunk rather than as one long recording. Each unit pairs its own audio clip, a blurred-behind-an-eye-toggle Mandarin transcript (the chunk's own `mandarin`, not the full sentence), and an input the learner can either type into or fill via press-and-hold recording. Recording posts straight to `POST /chat/stt` (`backend/routes/chat.py`, see [voice-interaction.md](./voice-interaction.md)) — no new STT endpoint, no new Whisper call shape, and the same per-plan `available_token` gating/charging every other STT use gets. The transcript replaces the input's contents, same as chat's press-and-hold record button.

The page still applies `segment_count`'s drift guard (see [schema-tenancy.md](../architecture/schema-tenancy.md)), but per-sentence rather than as a single `Math.min` truncation: a sentence is only flattened into shadowing units if it has `chunks`, or its index is below `segment_count` — a chunked sentence's audio isn't tracked by `segment_count` at all (there is no whole-sentence `audio-<id>.mp3` to count for it), so it's trusted unconditionally the same way `breakdown.json`'s `chunks` are trusted to have matching per-chunk clips.

"Check" compares the input against the sentence (or chunk) with `matchesSentence`/`diffSentenceChars` (`frontend/src/utils/listening/matchesSentence.ts`) — a punctuation/whitespace-insensitive character comparison, entirely client-side. This is deliberately **not** pronunciation-quality feedback: it tells the learner whether the words they said (as transcribed by Whisper) match the target sentence, character by character, not whether their tones or pronunciation were correct. Whisper's own transcription already normalizes a lot of mispronunciation into "close enough" text, so this check is a comprehension/production aid, not a phonetic judge — [voice-interaction.md](./voice-interaction.md) considered and dropped real pronunciation-quality feedback (see its open question 3).

### 5. Completion is a learner self-report, not inferred from any score

`POST /listening-practices/<id>/complete` (`backend/routes/complete_listening_practice.py`) takes `{"completed": true|false}` — asked as a plain Yes/No question at the bottom of the detail page — and upserts `listening_progress.status` to `DONE`/`WIP` accordingly, with no score threshold. This replaced an earlier version of the endpoint that inferred `DONE`/`WIP` from the Questions score at the same 80% threshold `complete_grammar_point.py` still uses. The two now differ on purpose: a listening topic is fundamentally "have you internalized this", a judgment call only the learner can make, not "did you get the multiple-choice questions right" — the same self-reported-vs-judged distinction [writing-practice.md](./writing-practice.md) draws for its own completion (decision 7), just resolved the other way (writing practice *is* judged, by grammar correctness; listening is self-reported).

The endpoint doesn't touch `vocabulary_score`/`grammar_score` (that's `refresh`'s job, decision 2) and stores no comprehension score at all — there's no column for it on `listening_progress`.

### 3b. A trailing `open_question` exercise becomes a bonus writing-practice question, reusing writing practice's AI checks verbatim

Every topic's `exercises.json` ends with one `{id, type: "open_question", question}` entry alongside its `multiple_choice` questions. `GET /listening-practices/<id>` (`backend/routes/get_listening_practice.py`) splits that entry out of the `exercises` array it returns into its own `bonus_question` field (`str | None`) instead of letting `ListeningExercises.tsx`'s multiple-choice rendering see it — that component indexes into `choices`, which an open question doesn't have.

`ListeningPracticeDetailPage.tsx` renders `bonus_question` (when present) as a sixth, visually distinct "Bonus: Writing practice" section at the very bottom of the page, after Completion. `ListeningWritingBonus.tsx` (a new component, not a route or a `writing_practice` topic) implements the interaction: a multi-line textarea, a topic-relevance check against the listening question's own text, then a per-sentence grammar check inviting corrections — calling the exact same endpoints writing practice's own detail page uses (`POST /writing/check-topic-relevance`, `POST /writing/check-sentence`, `POST /grammar-points/check`, `POST /grammar-points/record-usage`; see [writing-practice.md](./writing-practice.md) decisions 3, 4, 8). No new backend route or LLM prompt was added for this — the "topic" a bonus question is checked against is just the listening question's text, passed straight through to `check_writing_topic_relevance`, which already takes an arbitrary prompt string rather than a `writing_practice` topic id.

The submit → topic-relevance-check → per-sentence-check state machine itself (`groupByParagraph`, `isFlawed`, `runSentenceCheck`, `isAllCorrect`, `buildReviewSummary`, `buildSentenceCorrectionContext`) was extracted out of `WritingPracticeDetailPage.tsx` into `frontend/src/utils/writing/sentenceReview.ts` so both components run identical logic instead of two copies drifting apart. What's deliberately **not** shared: draft persistence, the context/writing/completed tabs, and the completed-versions archive — a bonus question has no `writing_practice` topic id to save a draft against and no archive concept; closing the page or leaving it unanswered loses the in-progress answer, same as an unanswered `multiple_choice` question already does.

### 6. No listening-specific plan gate exists; cost control rides on the shared chat token budget

Listening practice itself — the catalog, comprehension questions, full audio playback, shadowing clips — is not plan-gated: free and pro learners see the same topics and can take the same exercises. The only cost control in play is incidental: shadowing's `POST /chat/stt` call is gated/charged against the same per-plan `available_token` budget every other STT use is (see [plan-management.md](./plan-management.md)), so a learner who has exhausted that budget via chat also loses shadowing transcription until the next monthly reset — not because listening practice enforces anything itself.

The Preferences "Compare plans" dialog (`ChangePlanModal.tsx`) now lists a "Listening exercises" row alongside AI chat and grammar, labeled `Limited` for free / `Full access` for pro — describing that same shared-budget reality (identical to how the `aiChat`/`grammar` rows are worded) rather than a dedicated cap unique to listening. If a real per-feature quota is ever introduced, this row (and this decision) should be revisited.

### 7. Answers are persisted wholesale as one JSON blob, saved on Verify/Check/Submit, never on a keystroke

`listening_progress.progress` (`VARCHAR`, nullable) stores a JSON-stringified `{exercises, shadowing, bonus}` object — the learner's answers across all three of a topic's interactive sections in one row, not three separate columns or a child table. `exercises` is `Record<exerciseId, choiceIndex>` (mirrors `ListeningExercises`' own internal `answers` state); `shadowing` is `Record<shadowingUnitKey, {text, result}>` keyed by the same `key` `ListeningPracticeDetailPage` already builds for each shadowing unit (`"<sentenceId>"` or `"<sentenceId>-<chunkId>"`); `bonus` is the bonus section's `WritingSentenceCheck[] | null` (decision 3b) — the exact array `ListeningWritingBonus` renders from, so restoring it is just passing it back in as `initialSentenceChecks`, no reconstruction needed.

`POST /listening-practices/<id>/progress` (`backend/routes/save_listening_progress.py`) replaces the whole blob on every call — it is not a per-field merge endpoint. `ListeningPracticeDetailPage` owns all three pieces of state (`exercisesAnswers`/`shadowingAnswers`/`bonusChecks`) precisely so it can always send the complete triple: `ListeningExercises`' `onVerify`, each `ShadowingSentence`'s `onCheck`, and `ListeningWritingBonus`'s `onProgressChange` each report only their own slice, which the page merges with the other two in-memory before saving — never a partial write that could clobber another section's already-saved answers. The bonus section's raw pre-submit textarea draft is deliberately **not** part of this blob (or restored) — only post-check snapshots are — so a learner who types an answer but never clicks Submit loses it on reload, same as an unanswered `multiple_choice` selection already does; this matches "no need to save on every keystroke" and keeps the endpoint a plain wholesale-replace rather than something needing debouncing or per-input traffic.

`GET /listening-practices/<id>` parses the stored string back into an object for its `progress` response field (`null` if nothing was ever saved), and each child component takes an `initial*` prop to seed its own state from its slice: `ListeningExercises` also recomputes `isVerified`/`score` from a fully-answered `initialAnswers` so a restored attempt looks exactly as if Verify had just been clicked, rather than only re-selecting choices with no feedback shown.

#### Consequences

- One row, one column, one wholesale save — no migration-prone per-section schema, and no partial-update races between the three sections' independent save triggers.
- A save is a full overwrite: two browser tabs open on the same topic will have the second save's whole blob clobber the first's, including sections the second tab never touched. Acceptable for a single-learner, single-device feature; would need real per-field merging (or per-section columns) if concurrent multi-tab editing ever became a real scenario.
- `progress` is opaque JSON to Postgres (a `VARCHAR`, not `JSONB`) — no server-side querying/indexing into individual answers is possible without parsing every row in application code. Fine today since nothing reads this column except the one owning route; revisit (e.g. to `JSONB`, matching `words.custom_fields`) if a future feature needs to query into it.

## Consequences

### Advantages

- No new content infrastructure: the catalog reuses the exact S3-bucket-as-source-of-truth / Postgres-as-metadata split the grammar and writing curricula already established, so adding a topic is a content change (a new `overview.yaml` + audio + transcript, then a reload), not a code change.
- No new speech infrastructure: shadowing's record-and-transcribe UX and its cost accounting are identical to chat's, inherited for free.
- Scores are computed from state the app already tracks (vocabulary, grammar mastery) instead of requiring the learner to "test into" a topic first, so the catalog is useful (sorted by fit) from the very first visit.
- Self-reported completion avoids the awkwardness of a score threshold on an exercise (shadowing) that isn't even scored server-side.

### Drawbacks / follow-ups

- Shadowing's "correctness" is text-match only — a learner with poor tones but a lucky Whisper transcription passes, and a learner with correct tones but a transcription glitch fails. There is no phonetic/pronunciation scoring.
- `vocabulary_score`/`grammar_score` measure *readiness*, not *comprehension achieved* — a learner can mark a topic `DONE` (decision 5) without ever having gotten the comprehension questions right, since the two are intentionally decoupled (decision 3).
- No listening-specific quota: shadowing STT calls share the same per-plan `available_token` budget as ordinary chat use (see [plan-management.md](./plan-management.md) and [voice-interaction.md](./voice-interaction.md)) rather than having their own cap — not something a learner can reason about from the listening page itself.
- The "Compare plans" dialog's `Limited`/`Full access` wording for listening exercises describes the same shared-token-budget reality as the `aiChat` row, which is fine today but reads as if listening had its own limit — if a future revision adds a dedicated listening quota, this row's copy (and the note above) should be updated to match.

## Out of scope (remaining)

- Pronunciation-quality feedback (tones, phoneme-level accuracy) for shadowing — deliberately dropped, not deferred; see [voice-interaction.md](./voice-interaction.md)'s open question 3.
- A listening-specific rate limit or token quota, separate from the shared chat `available_token` budget.
- Adaptive difficulty (e.g. surfacing topics based on comprehension-question performance rather than only vocabulary/grammar readiness).
- Caching or reusing shadowing transcriptions across attempts — every "Check" re-records and re-transcribes from scratch.

## Open questions for a future revision

1. Should a comprehension-question score ever feed back into `vocabulary_score`/`grammar_score`, `status`, or topic ordering, instead of staying purely ephemeral (decision 3)?
2. If pronunciation-quality feedback is ever built (see [voice-interaction.md](./voice-interaction.md)), does it replace or sit alongside the current text-match "Check" in `ShadowingSentence`?
3. Should listening exercises get their own quota once a payment provider exists, rather than riding on the shared chat token budget (decision 6)?
