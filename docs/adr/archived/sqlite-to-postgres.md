> **Archived — no longer current**
>
> | | |
> | --- | --- |
> | **Invalid from** | 2026-07-30 |
> | **Why** | SQLite has been fully removed from the application, tests, and tooling. The project is PostgreSQL-only; the one-shot SQLite→Postgres import script and related helpers were deleted. |
> | **Follow-up** | [PostgreSQL architecture](../postgres.md) |
>
> ---

# SQLite → PostgreSQL (Alembic)

## Status

Accepted

## Context

Teacher Wang historically used a local SQLite file with schema created by `db.create_all()` and imperative `_migrate_*` helpers in `backend/database.py`. That approach does not scale to a shared Postgres instance or cloud hosting, and makes schema history hard to review.

Connection secrets must not live in git.

## Decision

### Connection configuration

* App runtime requires **`DATABASE_URL`** (PostgreSQL).
* Backend tests require **`TEST_DATABASE_URL`** pointing at a **dedicated** database (for example `teacher_wang_test`), never the primary app DB.
* Store local credentials in a **gitignored** repo-root `.env` (template: `.env.example`).
* Missing URLs raise at startup / test setup (no silent SQLite fallback).

### Schema management

* Alembic is the source of truth (`alembic.ini`, `backend/migrations/`).
* App startup and the test harness both run `alembic upgrade head` via `backend/alembic_runner.py` (tests pass an explicit URL so migrations apply to `TEST_DATABASE_URL`).
* The SQLAlchemy URL is passed through Alembic `Config.attributes`, not `set_main_option`, so URL-encoded passwords (`%XX` from ECS `DB_PASSWORD`) do not trip ConfigParser interpolation.
* Seed / data helpers (`_ensure_hsk_content_loaded`, `_ensure_settings`, legacy token-settings → `token_count`, ignore-list table migration) run in `init_db` for the app.

### Tests

* ORM / integration tests inherit `PostgresTestCase` (`backend/tests/postgres_test_case.py`), which truncates learner/reference tables between tests.
* GitHub Actions coverage workflow runs Postgres 15 as a service and exports `TEST_DATABASE_URL` / `DATABASE_URL`.
* The one-shot SQLite→Postgres **data import** script may still use temporary SQLite files when verifying copy helpers; the application itself does not use SQLite.

### Learner data import

* `python3 scripts/migrate_sqlite_to_postgres.py` copies learner tables from an old SQLite file into Postgres (HSK tables skipped).
* `character.pinyin` is `VARCHAR(8)` (Alembic `376edc4d57aa`).

## Migration plan (completed)

Phases 0–2 (scaffold, local cutover, retire SQLite runtime) are done. Desktop packaging was cancelled in favor of cloud. Tests and CI are Postgres-only.

### Ongoing schema changes

1. Change models in `backend/models.py`.
2. `python3 -m alembic revision --autogenerate -m "…"`.
3. Review the generated script; apply with `python3 -m alembic upgrade head` (or app/test startup).
4. Update the [postgres ADR](../postgres.md) / README when bootstrap commands change.

## Commands

Historical bootstrap commands (kept for archaeology). Living operator commands: README **Getting started** / **Database**.

```bash
PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang;'
PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang_test;'

cp .env.example .env
python3 -m pip install -r backend/requirements.txt
python3 -m alembic upgrade head

python3 -m unittest discover -s backend/tests -v

# optional: import learner data from an old SQLite file
python3 scripts/migrate_sqlite_to_postgres.py \
  --sqlite backend/teacher_wang.db
```

## Consequences

### Advantages

* Reviewable schema history; local, CI, and cloud share one dialect.
* Secrets stay out of git (`.env`).
* Tests exercise real Postgres constraints and upserts.

### Drawbacks / follow-ups

* Developers and CI need a running Postgres.
* Tests are slightly slower than in-memory SQLite.
* Very old SQLite files are not upgraded in-place (use the import script).
