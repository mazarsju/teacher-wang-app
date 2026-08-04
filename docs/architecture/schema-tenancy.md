# Schema tenancy reference

Canonical decision and rationale: [data isolation ADR](../adr/data-isolation.md). Coding invariants: `.cursor/rules/multi-tenant.mdc`.

## The `users` table

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | Cognito `sub` (stable across username/email changes) |
| `username` | `TEXT NOT NULL UNIQUE` | From the access token `username` / `cognito:username` claim |
| `email` | `TEXT NOT NULL UNIQUE` | From a verified ID token when the client sends one; otherwise the unique placeholder `{sub}@users.local` |
| `plan` | `TEXT NOT NULL DEFAULT 'free'` | Billing tier hook |
| `last_connexion` | `TIMESTAMPTZ NOT NULL` | Refreshed on every authenticated request |

## Private tables (`user_id` FK → `users.id`, hash-partitioned, modulus 8)

| Table | Primary key |
| --- | --- |
| `character` | `(user_id, char)` |
| `words` | `(user_id, word)` |
| `character_word` | `(user_id, character_char, word)` |
| `settings` | `(user_id, key)` |
| `ignore_vocab_card` | `(user_id, writting)` |
| `ignore_writting_card` | `(user_id, recto)` |
| `token_count` | `(user_id, recorded_at, type)` |

`character_word` is partitioned like its parents on purpose: its composite foreign keys are `(user_id, character_char) → character (user_id, char)` and `(user_id, word) → words (user_id, word)`, so an association can never straddle two users.

## Shared tables (no `user_id`, not partitioned)

`hsk_words`, `hsk_characters`, `hsk_word_character`. They are loaded once at boot (`database.init_db`) and only ever read by the app.

## Partitioning mechanics

SQLAlchemy models declare plain tables; they do not know about partitions. Partitioning lives in raw SQL inside the Alembic revision:

```sql
CREATE TABLE settings (
    user_id TEXT NOT NULL REFERENCES users (id),
    key VARCHAR(64) NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
) PARTITION BY HASH (user_id);

CREATE TABLE settings_p0 PARTITION OF settings
    FOR VALUES WITH (MODULUS 8, REMAINDER 0);
-- … p1 … p7
```

Modulus 8 is a compromise for the "tens to low hundreds of users" posture: enough to spread hot tables, few enough to keep planning cheap. Changing it means a new migration that rewrites the partition set.

## Target shape

```text
One RDS PostgreSQL database
├── users                     -- PK = Cognito sub
├── private tables            -- user_id first in the PK, PARTITION BY HASH (user_id) MODULUS 8
└── hsk_*                     -- shared, read-only for the app role
```
