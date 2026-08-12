# Multi-Agent Chat Architecture

## Status

Accepted

## Context

Chat practice is a core Teacher Wang feature. A single LLM call is not enough for challenge scenarios: the app must stay in character, prefer the learner’s known vocabulary, correct grammar without blocking the main thread, and advance structured challenge tasks only when both sides cooperate.

The implementation lives mainly in `backend/utils/aiChat/chat_service.py`, with persona prompts in `backend/utils/aiChat/chat_agents.py` and orchestration in `backend/routes/chat.py`.

## Decision

Each user turn is handled by collaborating specialized agents rather than one monolithic prompt.

### Character agent

Each chat persona (friend, waiter, Teacher Wang, etc.) is a role-play agent with its own system prompt: situation, speaking style, and progression rules. In a **challenge**, that prompt encodes a fixed order of events (for example: call the waiter → order → eat → pay). The agent must stay in character, speak Chinese, and refuse out-of-order requests.

Wherever possible, the character also tries to use only Han characters from the learner’s **knowledge base**. After each reply, unknown characters are detected against that vocabulary. If any appear, the agent is asked to rephrase without them (up to **3** retries). If unknown characters remain, the app keeps the attempt that used the **fewest** unknown characters.

When the learner's knowledge base has fewer than **250** characters, the retry loop is too slow to be useful, so the full known-character list is listed directly in the system prompt up front, with an instruction to answer using only those characters.

Teacher Wang itself does not run the unknown-character retry loop or the small-knowledge-base character list (`retry_unknown_characters: false`).

`generate_chat_reply` no longer caps history to a fixed window (it used to slice Teacher Wang to the last 3 messages). Long conversations are instead handled by the **conversation memory** system below: the frontend sends only the newest messages once a conversation is long enough, and the backend fills the gap by injecting a stored summary into the system prompt.

### Teacher agent (grammar)

For every non–Teacher Wang conversation, Teacher Wang silently reviews the learner’s latest Chinese message and assigns a **severity**:

| Severity | Meaning |
| --- | --- |
| `none` | Grammatically correct |
| `minor` | Pedantic nitpick a picky teacher might mention |
| `awkward` | Not strictly ungrammatical, but wording is strange or misleading |
| `incorrect` | Grammatically wrong |

The API returns `{"severity": "…"}` (plus `answer` when severity is not `none`). The UI shows a badge on the user message for every level: a non-clickable green check for `none`, and clickable orange/red icons for `minor` / `awkward` / `incorrect`. Opening a note starts a Teacher Wang side thread with the short correction so the learner can ask follow-up questions without leaving the main chat. Severity is also stored on the conversation log so badges survive history reload.

### Behavior planner, generator, and validator (Teacher Wang)

When the character is Teacher Wang itself (not a role-play character), the
reply is produced by three extra collaborating calls on top of the base
character agent, described in
[architecture/teacher-wang-behaviors.md](../architecture/teacher-wang-behaviors.md):

1. **Planner** — given the learner's message and conversation so far, selects
   which teaching *behaviors* (answering directly, explaining grammar,
   correcting an error, …) apply to this turn.
2. **Generator** — the character agent call, whose system prompt is Teacher
   Wang's base persona plus the selected behaviors' requirements. A few
   behaviors that apply to every turn (bilingual balance, encouragement,
   response formatting) are unioned in unconditionally rather than left to
   the planner, since per-turn selection of "always true" behaviors proved
   unreliable.
3. **Validator** — (deactivated for now. Should change BEHAVIOR_CHECK_ENABLED
   flag to put it back) checks the generated reply against the selected
   behaviors' success criteria. If any fail, it explains what was wrong per
   behavior and the generator gets one revision attempt, given that specific
   feedback. The revised reply is re-validated; whichever of the two
   attempts has fewer unresolved failures is kept (ties keep the original).
   The generator never gets a second revision — one retry only.

Proficiency-level adaptation is handled separately by the **Teaching
Strategy** (`backend/utils/aiChat/teaching_strategy.py`,
[architecture/teacher-wang-teaching-strategy.md](../architecture/teacher-wang-teaching-strategy.md)):
a deterministic, code-defined mapping from the learner's HSK level to
language balance, pinyin/translation policy, vocabulary scope, and
encouragement style. It is not planner-selected — the learner's level is
known in advance, so there is nothing for a planner to judge — and its
rendered instructions are given to both the planner (as context) and the
generator (as concrete instructions), replacing what used to be a generic
"answer at HSK N" sentence.

### Challenge judge

After the character agent replies in a challenge, a **Challenge Judge** reviews the full turn and does two jobs:

1. **Task progress** — marks challenge tasks complete only when the learner attempted them in Chinese *and* the character cooperated (a refusal does not count).
2. **Coherence** — checks that the character’s reply fits the situation and scenario rules. If it does not, the judge explains why and asks the character to revise **once**. If the second answer is still incoherent, it is sent anyway; the judge cannot block a reply twice.

The exchange between judge and character (when a revision happens) is returned on the chat API as `judge_conversation`: it starts with the refused character reply, then the judge’s feedback (and a second judge note if the revision is still incoherent). The final character reply is only in `message.content`, not duplicated there. Only that final reply is stored in the learner-facing history.

### Conversation memory (summarization)

Non-challenge conversations (Teacher Wang and roleplay characters) no longer grow the LLM context window forever. Two things work together, both keyed on **user messages only** (assistant replies don't count towards these thresholds):

**Background summarization** (`backend/utils/aiChat/conversation_summary.py`). Every 4 user messages (`should_summarize`, `SUMMARY_TRIGGER_MESSAGE_COUNT = 4`), `_handle_main_chat` (`backend/routes/chat.py`) fires `queue_conversation_summary` on a daemon thread **after** the chat response is returned — a genuine fire-and-forget background job, not part of the request. That job:

1. Reads the persisted transcript and takes the newest 4 user turns plus their interleaved assistant replies (`_last_n_user_turns` — typically ~7 raw messages).
2. Asks the LLM to **merge** those messages into the existing stored memory (not summarize them alone), using one of two schemas/prompts: `TEACHER_WANG_SUMMARY_SYSTEM_PROMPT` (teaching context: topics, grammar points, learner strengths/difficulties, vocabulary, unresolved questions) for `teacher-wang`, or `GENERIC_SUMMARY_SYSTEM_PROMPT` (situation, events, participants, open threads) for every other character.
3. Stores the merged result in the `conversation_summary` table (`user_id`, `conversation_id` = the character id, `summary` JSONB, `revision`, `latest`). Each conversation keeps **at most 2 rows** — the current `latest = true` row and the one before it (`latest = false`); storing a new one deletes the old "old" row, demotes the current `latest` to "old", and inserts the merge as the new `latest` with `revision` incremented. `store_conversation_summary` is what enforces this rolling window.

**Context injection** (`context_summary_for_turn`). Once a conversation has reached 8 user messages (`MIN_MESSAGES_FOR_CONTEXT_SUMMARY`), the frontend stops sending full history and the backend fills the gap from the stored summary instead of the naive last-N-messages cap this replaced:

* The frontend (`frontend/src/utils/aiChat/chatContextWindow.ts`, `trimMessagesForContext`) only sends the newest user turns (plus their interleaved assistant replies) on each `POST /chat`: `userCount % 4 < 3` sends `(userCount % 4) + 4` user turns, `>= 3` sends just `userCount % 4` turns.
* The backend recomputes the same `user_message_count` independently from its own persisted storage (never trusts the frontend's count) and picks which summary row to inject into the system prompt as `summary_context`: the **old** (`latest = false`) row for the first few turns after a trigger (remainder `< 3`) — giving the background job time to finish — or the **latest** row once that buffer has passed (remainder `>= 3`).
* `generate_chat_reply` appends `summary_context` (when present) to the system prompt as labeled JSON ("Conversation memory (earlier context as structured JSON)").

**Scope and lifecycle.** Challenge conversations are excluded entirely — they keep sending full history, since the Challenge Judge reasons over the whole transcript. Correction threads (`_handle_thread_chat`) are excluded too. `DELETE /conversation-logs/<character_id>` and `DELETE /database/knowledge-base` both purge the matching `conversation_summary` rows (`delete_conversation_summaries`) alongside the transcript, so summaries never outlive the conversation they describe.

### Smart AI toggle (light vs. full pipeline)

Learners can turn **Smart AI** off from Preferences → AI usage. The setting
(`smart_ai_enabled` in `backend/utils/database/settings.py`, default **on**) is read
directly by `chat_service.py`; it is a plain boolean check, not something
the planner or any model reasons about.

When Smart AI is **off**:

* **Teacher Wang** skips the planner, every behavior from
  [architecture/teacher-wang-behaviors.md](../architecture/teacher-wang-behaviors.md)
  — including the three marked "always-on" above (bilingual balance,
  encouragement, response formatting) — the validator, and the retry. The
  reply becomes a single LLM call using only the base persona plus the
  Teaching Strategy. HSK-level language adaptation is unaffected either way,
  since it costs no extra call and isn't part of the toggle.
* **Challenges** still run the Challenge Judge to detect completed tasks —
  that is core functionality, not an "extra" — but skip the coherence-check
  revision round trip. An incoherent reply is sent as-is instead of being
  revised once.
* **Grammar severity checking** on non–Teacher-Wang conversations is
  unaffected either way; it was never part of Smart AI.

Net effect: a Teacher Wang turn drops from up to 5 LLM calls to 1, and a
challenge turn drops from up to 4 (character + judge + revision + re-judge)
to 2 (character + judge, never revised).

### Interaction overview

```text
User
 │
 │  Chinese message
 ├──────────────────────────────► Teacher agent (grammar)
 │                                      │
 │                                      ├──► severity badge (always)
 │                                      │    none | minor | awkward | incorrect
 │                                      │
 │                                      └──► correction thread
 │                                           (only if severity ≠ none)
 │
 │  same message (main chat)
 └──────────────────────────────► Character agent (role-play)
                                        │
                                        │ prefer known vocabulary;
                                        │ rephrase up to 3× if unknowns;
                                        │ keep attempt with fewest unknowns
                                        ▼
                                  Challenge judge
                                   /            \
                          coherent /              \ incoherent (1st time only)
                                  /                \
                                 ▼                  ▼
                          tasks + OK          explain why + ask to revise
                                 │                  │
                                 │                  ▼
                                 │            Character revises once
                                 │                  │
                                 │                  ▼
                                 │            Judge re-checks tasks
                                 │            (cannot block again)
                                 │                  │
                                 └────────┬─────────┘
                                          ▼
                                   User sees final reply
                                   (+ completed tasks;
                                    + judge_conversation if revised)
```

## Rationale

* Separating grammar, role-play, and challenge judging keeps prompts focused and easier to evolve.
* Vocabulary retries happen inside the character loop so the learner still gets one reply, not a cascade of UI steps.
* The judge may revise the character once, then yields, so challenges cannot soft-lock on endless incoherence loops.
* Grammar feedback uses severity levels so minor nits and awkward wording are distinct from hard errors; only non-`none` severities open a side thread, so practice flow is not interrupted by every note.

## Consequences

### Advantages

* Challenge scenarios stay rule-aware without stuffing every constraint into one giant system prompt.
* Learners see a severity badge on each message and can open corrections without losing the main conversation.
* Unknown-vocabulary pressure is soft: best-effort rephrase, then best remaining attempt.
* Long non-challenge conversations stay cheap: request payload and LLM context both stop growing once conversation memory kicks in, instead of resending (and re-billing) the full transcript every turn.

### Drawbacks

* One user turn can cost several LLM calls (grammar + character + retries + judge + optional revision); for Teacher Wang specifically, up to five more (planner + generator + validator, plus one revision generator + re-validator if the validator flagged a problem).
* Judge/character revision quality depends on structured JSON parsing from the model.
* Conversation memory quality depends on the same structured JSON parsing, and the summarization job runs in the same process on a background thread — it isn't durable against a mid-request process restart, and the "old vs. latest" summary selection is a heuristic timing buffer, not a guarantee the background merge has finished.
* Adding a new challenge requires persona prompt, tasks, and judge-compatible task ids to stay aligned — mitigated by the Cursor **create-challenge** skill (`.cursor/skills/create-challenge/`), which wires one `character_id` through backend + frontend with shared task ids and mandatory agent rules.

## Future evolution

New challenge characters should keep the same split: character prompt for role-play, shared judge for tasks/coherence, optional grammar check on the learner message. Prefer extending `chat_agents` / challenge registration via the **create-challenge** skill over collapsing agents into a single prompt.
