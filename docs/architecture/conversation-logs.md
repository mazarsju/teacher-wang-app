# Conversation logs storage

Part of the [data isolation](../adr/data-isolation.md) decision. Chat transcripts and challenge task progress are **per Cognito user** (`sub`):

| Environment | Backend | Layout |
| --- | --- | --- |
| Local / tests | Filesystem (`CONVERSATION_LOGS_BACKEND=local`, default) | `CONVERSATION_LOGS_DIR/users/{sub}/{character_id}.txt` (+ threads / `.tasks.json`) |
| Prod (ECS) | S3 (`CONVERSATION_LOGS_BACKEND=s3`) | `s3://…/users/{sub}/{character_id}.txt` (+ threads / `.tasks.json`) |

API: `GET/POST/PATCH/DELETE /conversation-logs/<character_id>` (and `POST /chat` for LLM turns). History is loaded when a chat opens; there is no process-wide transcript cache.

`DELETE /database/knowledge-base` also wipes every object under a user's `users/{sub}/` prefix (all transcripts, threads, and challenge task progress), not just one character's.

Each character's transcript also has a companion row (or two) in the `conversation_summary` Postgres table, keyed by the same `character_id` — see [conversation memory](../adr/ai-agents.md#conversation-memory-summarization). `DELETE /conversation-logs/<character_id>` and `DELETE /database/knowledge-base` both purge those rows too (`delete_conversation_summaries`), so a cleared or deleted conversation never leaves behind a stale summary.

## Writing practice drafts

Same bucket/backend switch, different layout: `users/{sub}/writing/{topic_id}.json`, written by `backend/utils/writing/writing_drafts.py` (`load_draft`/`save_draft`) via the same `get_storage()`/`object_key()` helpers. Shape:

```json
{ "draft": "<current draft text>", "archive": [] }
```

`archive` holds every past fully-correct submission (`{timestamp, content}`, appended by `complete_draft`); `save_draft` always preserves whatever is already there and only overwrites `draft`. API: `GET/POST /writing-practice/<topic_id>` (plus `POST /writing-practice/<topic_id>/complete` to archive) — the frontend fetches on opening a writing topic to resume work and show past submissions, and saves via a "Save draft" button (see the [writing practice ADR](../adr/writing-practice.md), decisions 6/7/10). Being under the same `users/{sub}/` prefix, drafts are also wiped by `DELETE /database/knowledge-base`'s prefix delete, same as transcripts.
