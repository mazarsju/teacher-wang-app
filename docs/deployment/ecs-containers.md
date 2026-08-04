# ECS containers

This app is deployed as **two images** consumed by [teacher-wang-infra](https://github.com/mazarsju/teacher-wang-infra). Coding invariants when editing Dockerfiles: `.cursor/rules/ecs-containers.mdc`. Push workflow: `.cursor/skills/update-ecr-images/` and `./scripts/push-ecr.sh`.

| Component | Dockerfile | Port in container | ECS host port |
| --- | --- | --- | --- |
| Backend | `backend/Dockerfile` | 5000 | 5000 |
| Frontend | `frontend/Dockerfile` | 80 | 8080 |

- Build context is always the **repo root** (`-f backend/Dockerfile .` / `-f frontend/Dockerfile .`).
- Target platform is **`linux/arm64`** (Graviton Spot `t4g`).
- Backend accepts `DATABASE_URL` **or** ECS-style `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`.
- Frontend nginx reverse-proxies **`/api/*`** to `BACKEND_UPSTREAM` (stripping the `/api` prefix). The browser must call `${API_BASE}/…` with `API_BASE = "/api"` — never hit the backend host directly.
- **Anki split:** Flask Anki bookkeeping goes through **`/api/anki/…`**. AnkiConnect note I/O is **`POST http://127.0.0.1:8765`** from the browser (see [AnkiConnect ADR](../adr/anki-connect.md)).
- Both images define a Docker `HEALTHCHECK` against `GET /health` (backend includes a Postgres `SELECT 1`; frontend is nginx-only and is not under `/api`).
- Push helper: `./scripts/push-ecr.sh` (requires `ECR_BACKEND` / `ECR_FRONTEND` from infra Terraform outputs).
