# teacher-wang-app

Skills for common workflows (create a challenge, generate an avatar, update
screenshots, push ECR images, refresh token prices) live in `.claude/skills/`.

## Documentation hygiene

- After changes that affect setup, commands, or project structure, update `README.md`.
- After changes that affect architecture (auth, tenancy, Anki, chat agents, Postgres, plan/tokens, deploy), update the matching ADR under `docs/adr/`.
- Doc map and ADR archive process: `docs/README.md`.
- Do not duplicate ADR rationale into this file or README — link instead.

## Testing

- After changing `frontend/src/**`, run `cd frontend && npx vitest run --silent` and fix any failures before finishing.
- After changing `backend/**`, run `python3 -m unittest discover -s backend/tests -q` and fix any failures before finishing.
- Always pass `--silent` to vitest and `-q` to unittest to keep output minimal; drop the flag only when a failure needs full output to diagnose.
- Any new feature or element (component, page, route, util, service function) must ship with unit tests covering it — frontend (`*.test.tsx`/`*.test.ts` next to the source) and/or backend (`backend/tests/`), as applicable.

## Python command

Applies to: `**/*.py`, `**/*.sh`.

Use `python3`, not `python`, when running Python or Python modules:

```bash
python3 -m venv venv
python3 -m backend.app
python3 -m pip install -r backend/requirements.txt
python3 -m alembic upgrade head
python3 -m unittest discover -s backend/tests -v
```

Only use `python` if the environment explicitly requires it.

## Multi-tenant backend

Applies to: `backend/**/*.py`.

Rationale: `docs/adr/data-isolation.md`, `docs/adr/auth.md`. Schema catalog: `docs/architecture/schema-tenancy.md`.

- Auth is global via `before_request` in `backend/user_context.py`. Do not add per-route auth decorators. Public routes: `OPTIONS`, `/health`, and the entries in `PUBLIC_PATHS` (pre-session routes like password reset) only.
- Read the tenant with `current_user_id()` (returns `users.shortid`); never re-parse JWT claims in a view.
- Every query on a private table must filter by `user_id`; every insert must set it; updates/deletes must match on it. There is no RLS backstop yet.
- Service functions take `user_id` as their first argument (do not reach into `flask.g`).
- New private tables: `user_id` first in the primary key (FK → `users.shortid`), plus `PARTITION BY HASH (user_id)` with `MODULUS 8` in raw SQL in the Alembic revision. SQLAlchemy models stay partition-agnostic.
- Shared `hsk_*` tables have no `user_id`.

## Frontend → Flask API

Applies to: `frontend/src/**/*.{ts,tsx}`.

- Call the Flask API through `frontend/src/utils/auth/apiFetch.ts` so Cognito headers are attached.
- Use `API_BASE = "/api"`. Nginx strips `/api` and proxies to the backend. Never hit the backend host directly from the browser in deployed environments.
- Auth details: `docs/adr/auth.md`. Deploy proxy: `docs/deployment/ecs-containers.md`.

## ECS container invariants

Applies to: `**/Dockerfile*`, `frontend/nginx*`, `scripts/push-ecr.sh`.

Full reference: `docs/deployment/ecs-containers.md`. Push workflow: `.claude/skills/update-ecr-images/`.

- Build context is always the **repo root** (`-f backend/Dockerfile .` / `-f frontend/Dockerfile .`).
- Target platform is **`linux/arm64`** (Graviton Spot `t4g`).
- Backend container port **5000**; frontend nginx **80** (ECS host **8080**).
- Backend accepts `DATABASE_URL` **or** ECS-style `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`.
- Frontend nginx reverse-proxies `/api/*` to `BACKEND_UPSTREAM` (stripping `/api`).
- Both images define a Docker `HEALTHCHECK` against `GET /health`.

## AnkiConnect boundary

Applies to: `**/anki*/**`, `frontend/src/utils/anki/**`, `backend/routes/*anki*`.

Rationale: `docs/adr/anki-connect.md`. Sync steps: `docs/anki/sync-protocol.md`.

- The React client is the only process that talks to AnkiConnect (`POST http://127.0.0.1:8765`, JSON-RPC root — not `/anki/…` paths).
- The backend never opens Anki or AnkiWeb.
- Flask Anki bookkeeping (`/anki/status`, sync, deck setup) goes through `/api/anki/…` like every other backend route.
