# PostgreSQL Architecture

## Status

Accepted

## Context

Teacher Wang persists the knowledge base, Anki deck mappings, ignore lists, and token usage in a relational database. The stack is a Flask API plus React UI, aimed at local development and cloud hosting (ECS). Using one engine everywhere keeps local, CI, and production aligned.

## Decision

### Engine

* **PostgreSQL only** for the application and for backend unit/integration tests.
* SQLAlchemy URL via **`DATABASE_URL`**, or ECS-style `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` (see `backend/db_config.py`).
* Secrets live in a gitignored `.env` (template: `.env.example`), not in the repo.

### Schema

* **Alembic** is the source of truth (`alembic.ini`, `backend/migrations/`).
* App startup runs `alembic upgrade head` before seed helpers (`backend/database.py` / `backend/alembic_runner.py`).
* Backend tests use **`TEST_DATABASE_URL`** (dedicated DB such as `teacher_wang_test`) and `PostgresTestCase`, which truncates tables between tests after migrating once.

### CI

* GitHub Actions coverage workflow starts Postgres 15 as a service and sets `TEST_DATABASE_URL` / `DATABASE_URL` to that throwaway database.

## Commands

```bash
PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang;'
PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang_test;'

cp .env.example .env
python3 -m pip install -r backend/requirements.txt
python3 -m alembic upgrade head

python3 -m unittest discover -s backend/tests -v
```

After model changes:

```bash
python3 -m alembic revision --autogenerate -m "describe change"
python3 -m alembic upgrade head
```

## Consequences

### Advantages

* One dialect for local, CI, and cloud.
* Reviewable schema history.
* Tests exercise real Postgres constraints and upserts.

### Drawbacks

* Developers and CI need a running Postgres.
* Tests are slightly slower than an in-process embedded DB would be.
