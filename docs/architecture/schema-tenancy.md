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
| `ignore_vocab_card` | `(user_id, writting)` |
| `ignore_writting_card` | `(user_id, recto)` |
| `token_count` | `(user_id, recorded_at, type)` |

Character↔word membership is derived at read time (a word contains its characters as substrings); there is no association table.

## Shared tables (no `user_id`, not partitioned)

`hsk_words`, `hsk_characters`, `hsk_word_character`. They are loaded once at boot (`database.init_db`) and only ever read by the app.

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
