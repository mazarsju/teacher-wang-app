# Agent Instructions

## Repository navigation

After every AI-assisted change in this repository, update `README.md` so it reflects the current setup, commands, and project structure. Use `README.md` as the primary source of truth when orienting yourself in the codebase; keep `agent.md` aligned with it so agents can find their way through the repository faster.

## Cloud containers (AWS / ECS)

This app is deployed as **two images** consumed by [teacher-wang-infra](https://github.com/mazarsju/teacher-wang-infra):

| Component | Dockerfile | Port in container | ECS host port |
| --- | --- | --- | --- |
| Backend | `backend/Dockerfile` | 5000 | 5000 |
| Frontend | `frontend/Dockerfile` | 80 | 8080 |

- Build context is always the **repo root** (`-f backend/Dockerfile .` / `-f frontend/Dockerfile .`).
- Target platform is **`linux/arm64`** (Graviton Spot `t4g`).
- Backend accepts `DATABASE_URL` **or** ECS-style `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`.
- Frontend nginx reverse-proxies **`/api/*`** to `BACKEND_UPSTREAM` (stripping the `/api` prefix). The browser must call `${API_BASE}/…` with `API_BASE = "/api"` — never hit the backend host directly.
- **Anki split:** Flask Anki bookkeeping (`/anki/status`, sync, deck setup) goes through **`/api/anki/…`** like every other backend route. AnkiConnect note I/O is a separate client: **`POST http://127.0.0.1:8765`** (JSON-RPC root — not `/anki/…` paths; AnkiConnect does not serve those).
- Both images define a Docker `HEALTHCHECK` against `GET /health` (backend includes a Postgres `SELECT 1`; frontend is nginx-only and is not under `/api`).
- Push helper: `./scripts/push-ecr.sh` (requires `ECR_BACKEND` / `ECR_FRONTEND` from infra Terraform outputs).

## Multi-user data isolation

The API is multi-tenant: `users.id` is the Cognito `sub`, and every private table starts its primary key with `user_id` (`character`, `words`, `character_word`, `settings`, `ignore_vocab_card`, `ignore_writting_card`, `token_count`). The HSK tables are shared and carry no `user_id`. Full rationale: `docs/data-isolation-archi-decision.md`.

When touching backend code:

- A `before_request` hook in `backend/user_context.py` authenticates every route except `OPTIONS` and `/health`, and resolves the tenant. Do not add per-route auth decorators.
- Read the tenant with `current_user_id()`; never re-parse JWT claims in a view.
- Every query on a private table must filter by `user_id`, every insert must set it, and updates/deletes must match on it. There is no RLS backstop yet, so a missing filter is a real data leak.
- Service functions take `user_id` as their first argument rather than reaching into `flask.g`, so they stay testable outside a request.
- New private tables need `user_id` in the primary key plus `PARTITION BY HASH (user_id)` with `MODULUS 8` in raw SQL inside the Alembic revision — the SQLAlchemy models stay partition-agnostic.
- Frontend calls to the Flask API go through `frontend/src/utils/auth/apiFetch.ts` so they carry the Cognito headers.

## Architecture decision documents

Architecture decisions live under `docs/` as `*-archi-decision.md` files (for example AnkiConnect, Anki sync, multi-agent chat, PostgreSQL, authentication, and data isolation). After any change that affects those areas—sync behavior, AnkiConnect responsibilities, chat agent collaboration, related APIs, database setup, auth/credentials, multi-user data isolation, or project structure—review the matching decision docs and update them so they stay accurate.

### Archiving obsolete decisions

When an architecture decision **no longer describes the current implementation** (for example a migration that finished, or a stack choice that was fully replaced):

1. **Do not delete** the decision file.
2. **Move** it to `docs/archived/` (keep the same filename).
3. **Prepend** a short archival header at the top of the file with:
   - the **date** from which the document is no longer valid;
   - **why** it is no longer valid;
   - optionally a link to any **follow-up** documentation that supersedes it (usually another `docs/*-archi-decision.md`).
4. Update `README.md` / this file so active decision lists no longer point at the archived path as current guidance (linking under an “Archived” note is fine).

Example header shape:

```markdown
> **Archived — no longer current**
>
> | | |
> | --- | --- |
> | **Invalid from** | YYYY-MM-DD |
> | **Why** | Brief reason the decision no longer matches the codebase. |
> | **Follow-up** | [Related current decision](../other-archi-decision.md) |
>
> ---
```

Current (active) decision docs:

- `docs/anki-connect-archi-decision.md`
- `docs/anki-sync-archi-decision.md`
- `docs/ai-agents-archi-decision.md`
- `docs/postgres-archi-decision.md`
- `docs/auth-archi-decision.md`
- `docs/data-isolation-archi-decision.md`

Archived decision docs (history only):

- `docs/archived/sqlite-to-postgres-archi-decision.md`

## Python

Use `python3` instead of `python` when invoking Python or running Python libraries and scripts in this project.

Examples:

```bash
python3 -m venv venv
python3 -m backend.app
python3 -m pip install -r backend/requirements.txt
```

Do not use the `python` command unless the environment explicitly requires it.
