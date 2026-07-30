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

## Architecture decision documents

Architecture decisions live under `docs/` as `*-archi-decision.md` files (for example AnkiConnect, Anki sync, and multi-agent chat). After any change that affects those areas—sync behavior, AnkiConnect responsibilities, chat agent collaboration, related APIs, or project structure—review the matching decision docs and update them so they stay accurate. Do not leave stale architecture notes behind when the implementation moves on.

Current decision docs:

- `docs/anki-connect-archi-decision.md`
- `docs/anki-sync-archi-decision.md`
- `docs/ai-agents-archi-decision.md`
- `docs/sqlite-to-postgres-archi-decision.md`

## Python

Use `python3` instead of `python` when invoking Python or running Python libraries and scripts in this project.

Examples:

```bash
python3 -m venv venv
python3 -m backend.app
python3 -m pip install -r backend/requirements.txt
```

Do not use the `python` command unless the environment explicitly requires it.
