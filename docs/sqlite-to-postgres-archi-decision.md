# SQLite → PostgreSQL (Alembic)

## Status

Accepted (Phases 0–2 done; Phase 3 desktop deferred)

## Context

Teacher Wang historically used a local SQLite file (`DATABASE_PATH` → `sqlite:///…`) with schema created by `db.create_all()` and imperative `_migrate_*` helpers in `backend/database.py`. That approach does not scale to a shared Postgres instance, makes schema history hard to review, and blocks multi-machine / hosted deployments.

Local Postgres is available (`localhost:5432`). Connection secrets must not live in git.

## Decision

### Connection configuration

* Prefer a full SQLAlchemy URL via **`DATABASE_URL`**.
* Store local credentials in a **gitignored** repo-root `.env` (template: `.env.example`).
* Resolution order (`backend/db_config.py`):
  1. `DATABASE_PATH` → SQLite (Tauri desktop only)
  2. `DATABASE_URL` → Postgres (required for local/web dev)
  3. Otherwise **raise** — no silent SQLite fallback

Current local `.env` target:

```text
postgresql+psycopg://postgres:…@localhost:5432/teacher_wang
```

### Schema management

* **PostgreSQL:** Alembic is the source of truth (`alembic.ini`, `backend/migrations/`). App startup runs `alembic upgrade head` before seeds.
* **SQLite (tests / desktop):** `db.create_all()` against current models only — legacy imperative schema `_migrate_*` helpers were removed.
* Seed / data helpers (`_ensure_hsk_content_loaded`, `_ensure_settings`, legacy token-settings → `token_count`, ignore-list table migration) still run in `init_db` for both dialects.

### Dialect-specific SQL

* HSK bulk load uses `INSERT … ON CONFLICT DO NOTHING` via a dialect switch (`postgresql` / `sqlite`) in `backend/routes/hsk_content_loader.py`.

### Learner data import

* One-shot copy from an existing SQLite file into Postgres:
  `python3 scripts/migrate_sqlite_to_postgres.py`
* Replaces learner tables (`character`, `words`, links, `settings`, ignore lists, `token_count`); does **not** overwrite HSK reference tables.
* During import, `character.pinyin` was widened to `VARCHAR(8)` (Alembic `376edc4d57aa`) so values like `chuang1` fit — SQLite never enforced the old length-6 limit.

## Migration plan

### Phase 0 — Scaffolding — done

1. `.env` / `.env.example`, gitignore `.env`.
2. Dependencies: `alembic`, `psycopg[binary]`, `python-dotenv`.
3. `DATABASE_URL` via `backend/db_config.py`.
4. Alembic initial revision matching models.
5. Database `teacher_wang` + `alembic upgrade head`.

### Phase 1 — Cut over local development — done

1. Developers use `.env` + local Postgres.
2. App start applies migrations + seeds.
3. SQLite → Postgres learner import script (`scripts/migrate_sqlite_to_postgres.py` / `backend/sqlite_postgres_migrate.py`).
4. README is Postgres-first; SQLite documented for tests/desktop.

### Phase 2 — Retire SQLite schema path (app code) — done

1. Removed imperative schema `_migrate_*` helpers from `database.py`.
2. Unit tests keep in-memory SQLite + `create_all`; schema-migration-only tests dropped.
3. Local default no longer falls back to `backend/teacher_wang.db`.

### Phase 3 — Desktop / Tauri — deferred

**Decision for now:** keep SQLite for the packaged app via `DATABASE_PATH` in the OS app-data directory. Packaged users should not need a local Postgres server.

Follow-ups when revisited: remote `DATABASE_URL`, embedded Postgres, or sync-to-cloud API.

### Phase 4 — Ongoing schema changes

1. Change models in `backend/models.py`.
2. `python3 -m alembic revision --autogenerate -m "…"`.
3. Review the generated script; apply with `python3 -m alembic upgrade head` (or app startup).
4. Update this document / README when bootstrap commands change.

## Commands

```bash
# one-time: create DB (as superuser)
PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang;'

cp .env.example .env
python3 -m pip install -r backend/requirements.txt
python3 -m alembic upgrade head   # also on app start for Postgres

# optional: import learner data from an old SQLite file
python3 scripts/migrate_sqlite_to_postgres.py \
  --sqlite backend/teacher_wang.db

# new revision after model changes
python3 -m alembic revision --autogenerate -m "describe change"
```

## Consequences

### Advantages

* Reviewable schema history; reproducible Postgres setups.
* Secrets stay out of git (`.env`).
* Local app targets the same engine family as a future hosted backend.
* Existing SQLite learner data can be imported deliberately.

### Drawbacks / follow-ups

* Developers need a running Postgres for local/web work.
* Tauri still uses SQLite (`DATABASE_PATH`) until Phase 3 changes.
* Very old SQLite files that predate the current model shape are no longer upgraded in-place by imperative migrations (use a current export or recreate).

## Future evolution

After Phase 3, drop SQLite from desktop if Postgres or a remote API is chosen. Revisit unbounded `String` columns vs `Text` if Postgres tooling complains.
