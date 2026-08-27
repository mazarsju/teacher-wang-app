# Schema tenancy reference

Canonical decision and rationale: [data isolation ADR](../adr/data-isolation.md). Coding invariants: `.cursor/rules/multi-tenant.mdc`.

## The `users` table

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | Cognito `sub` (stable across username/email changes) |
| `shortid` | `NUMERIC NOT NULL UNIQUE` | Auto-increment via `users_shortid_seq` (omit on insert; Postgres assigns). Tenant key for private tables |
| `username` | `TEXT NOT NULL UNIQUE` | From the access token `username` / `cognito:username` claim |
| `email` | `TEXT NOT NULL UNIQUE` | From a verified ID token when the client sends one; otherwise the unique placeholder `{sub}@users.local` |
| `plan` | `TEXT NOT NULL DEFAULT 'free'` | Billing tier hook |
| `last_connexion` | `TIMESTAMPTZ NOT NULL` | Refreshed on every authenticated request |

## Private tables (`user_id` FK → `users.shortid`, hash-partitioned, modulus 8)

| Table | Primary key |
| --- | --- |
| `character` | `(user_id, char)` |
| `words` | `(user_id, word)` |
| `settings` | `(user_id, key)` |
| `ignore_vocab_card` | `(user_id, writing)` |
| `ignore_writing_card` | `(user_id, recto)` |
| `ignore_hsk_words` | `(user_id, writing)` |
| `token_count` | `(user_id, recorded_at, type)` |
| `challenge_progress` | `(user_id, challenge_scenario)` |
| `writing_progress` | `(user_id, writing_topic)` — `score` (`NUMERIC`, nullable) instead of a completed flag |
| `conversation_summary` | `(user_id, id)` — `id` is a `BIGINT GENERATED ALWAYS AS IDENTITY`, unique on its own; `conversation_id` (= character id) + `latest` are queried, not part of the PK |
| `user_grammar_progress` | `(user_id, grammar_id)` — `grammar_id` FK → `grammar_points.id` |

Character↔word membership is derived at read time (a word contains its characters as substrings); there is no association table.

## Shared tables (no `user_id`, not partitioned)

`hsk_words`, `hsk_characters`, `hsk_word_character`. They are loaded once at boot (`database.init_db`) and only ever read by the app.

`weekly_articles` — `id` (`BIGINT` PK, autoincrement), unique on `(week, year, hsk_level)`. Holds the 3 LLM-picked China-news articles adapted to that HSK level, written by `run_weekly_article_generation()` (`backend/utils/generateArticle/service.py` → `weekly_article_generator.py`); refreshing overwrites the current week's row per level via upsert.

`grammar_points` / `grammar_prerequisites` — grammar rule catalog. `grammar_points.id` is `"{hsk_level}|{title}"`; `s3_key` is the rule's folder key (e.g. `hsk1/01-basic-sentence-structure`) in the `GRAMMAR_CONTENT_S3_BUCKET` bucket (see [teacher-wang-grammar](https://github.com/mazarsju/teacher-wang-grammar)). `grammar_prerequisites` is a `(grammar_id, prerequisite_id)` association table, both FK → `grammar_points.id`. `POST /admin/grammar/reload` clears and repopulates both, plus `writing_practice` (see below), from every `grammar.yaml`/`overview.yaml` in the bucket (`backend/utils/grammar/grammar_content_loader.py`), then rewrites `user_grammar_progress` rows whose `grammar_id` still exists (dropped or renamed ids are discarded); set `GRAMMAR_CONTENT_S3_PATH` to a local `teacher-wang-grammar`-layout checkout to reload from disk instead, for local debugging without AWS credentials. Decision notes: [grammar content architecture](../adr/grammar-content.md).

`writing_practice` — `id` (`TEXT` PK, e.g. `writing-present-yourself`), `title`, `after_grammar_point` (FK → `grammar_points.id`, the curriculum point this topic follows). Populated the same way as `grammar_points`, from every `writing_practice/<name>/overview.yaml` in the same bucket, in the same `POST /admin/grammar/reload` pass — cleared and reinserted before `grammar_points` is cleared, since it FKs into it. Not yet read by any endpoint; see the [writing practice ADR](../adr/writing-practice.md).

## Partitioning mechanics

SQLAlchemy models declare plain tables; they do not know about partitions. Partitioning lives in raw SQL inside the Alembic revision:

```sql
CREATE TABLE settings (
    user_id NUMERIC NOT NULL REFERENCES users (shortid),
    key VARCHAR(64) NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
) PARTITION BY HASH (user_id);

CREATE TABLE settings_p0 PARTITION OF settings
    FOR VALUES WITH (MODULUS 8, REMAINDER 0);
-- … p1 … p7
```

Modulus 8 is a compromise for the "tens to low hundreds of users" posture: enough to spread hot tables, few enough to keep planning cheap. Changing it means a new migration that rewrites the partition set. Switching the partition key from Cognito `sub` to `shortid` also requires rewriting the partition set (see revision `d5e6f7a8b9c0`).

## Target shape

```text
One RDS PostgreSQL database
├── users                     -- PK = Cognito sub; shortid = private-table tenant key
├── private tables            -- user_id (= shortid) first in the PK, PARTITION BY HASH (user_id) MODULUS 8
└── hsk_*                     -- shared, read-only for the app role
```
