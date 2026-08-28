# teacher-wang-app

Skills for common workflows (create a challenge, generate an avatar, update screenshots, push ECR images, refresh token prices) live in `.claude/skills/`.

## Documentation hygiene

**Before ending any task that touched code, run this checklist.** It is not optional and it is not just for large features — "the change was small" is the most common reason docs go stale. Answer each question; if yes, make the edit before reporting the task done, not after.

1. **Did setup, a command, a dependency, or the top-level file/directory layout change?** → Update `README.md`. This includes the `## Project structure` tree diagram itself — it lists bare filenames (no `backend/`/`frontend/` prefix per line), so a path-based find/grep pass over the repo will **not** catch it; edit it by hand whenever files move, get renamed, or a top-level dir is added/removed. Also update the `**Frontend:**`/`**Backend:**`/`**AI:**` tech-stack line if a new library/framework was added.
2. **Did a roadmap item (`README.md` → `## Roadmap`) get fully implemented?** → Check its box. If only partially implemented, leave it unchecked — do not check a box for partial progress; a follow-up doc note (ADR/architecture file) can record what landed.
3. **Did an architectural decision change or get made** (auth, tenancy, Anki, chat agents, Postgres, plan/tokens, deploy, frontend CSS, frontend localization, grammar content, writing practice, or a concern not yet listed)? → Update the matching ADR under `docs/adr/`, or create a new one following the existing ADR shape (Status/Context/Decision/Rationale/Consequences/Future evolution — copy an existing ADR's structure). A new ADR must be registered in **three** places: `docs/README.md`'s ADR table, `docs/README.md`'s "By retrieval concern" table, and `README.md`'s "Architecture decisions" list — grep the ADR filename across all three after adding it to confirm none was missed.
4. **Did a schema, storage layout, or protocol reference change** (the "what", not the "why")? → Update the matching file under `docs/architecture/` (e.g. `schema-tenancy.md` for a new/changed column, `conversation-logs.md` for S3/local path layout, `teacher-wang-behaviors.md`/`teacher-wang-teaching-strategy.md` for chat agent content).
5. **Did a container/ECS/deploy fact change** (ports, env vars, health checks, build context, proxy rules)? → Update `docs/deployment/ecs-containers.md`.
6. **Did the AnkiConnect sync protocol or setup steps change?** → Update `docs/anki/sync-protocol.md` (+ screenshots under `docs/anki/setup/` if the UI changed).
7. **Did a durable coding convention change or get introduced** (something future code generation must follow, not just this one change — e.g. "every new UI string goes through `t()`")? → Update the matching `.cursor/rules/*.mdc` file **and** this file's mirror section for it; the two are separate copies (Cursor reads `.mdc`, Claude Code reads `CLAUDE.md`) with no automatic sync, so a one-sided edit is itself a doc-hygiene bug. If no section exists yet for the new convention, add one to both, modeled on an existing pair (e.g. `frontend-styling.mdc` / this file's "Frontend CSS organization").
8. **Did you make a judgment call, discover a non-obvious constraint, or hit a tooling quirk mid-task that isn't written down anywhere** (e.g. a CLI flag that only works in one particular form)? → Capture it in the relevant doc/rule section rather than leaving it to be rediscovered next session. If unsure where it belongs, say so in the summary and ask rather than silently dropping it.

If in doubt, prefer updating over skipping — a stale doc actively misleads the next session (human or AI) in a way that no doc at all does not.

Reference: doc map and ADR archive process live in `docs/README.md`. Do not duplicate ADR rationale into this file or README — link instead. No artificial line breaks in any `.md` file: write each paragraph, list item, and blockquote line as one line, and let the editor/viewer soft-wrap. Applies repo-wide, not just to docs touched by a given change.

## Testing

- After changing `frontend/src/**`, run `cd frontend && npx vitest run --silent` and fix any failures before finishing.
- After changing `backend/**`, run `python3 -m unittest discover -s backend/tests -q` and fix any failures before finishing.
- Always pass `--silent` to vitest and `-q` to unittest to keep output minimal; drop the flag only when a failure needs full output to diagnose.
- When running vitest with specific test file paths (not the whole suite), pass `--silent=true` explicitly — `npx vitest run --silent <path>` fails with `Unexpected value "--silent=<path>"` because vitest's CLI parser reads the next positional argument as the flag's value. Bare `--silent` (no file paths after it) is fine.
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

## Frontend CSS organization

Applies to: `frontend/src/**/*.{ts,tsx,css}`.

Rationale: `docs/adr/frontend-styling.md`.

- Component/page styles go in a co-located `ComponentName.module.css`, imported as `styles` and referenced via `styles.camelCaseKey` (or `` styles[`kebab-key-${x}`] `` for dynamically built class names).
- `src/styles/` holds only `tokens.css` (design tokens) and `globals.css` (reset/base tag selectors) — never component-specific rules.
- Classes genuinely shared by many components (modal chrome, the toggle switch, the `Button` design system) live in `src/components/shared.css`, a plain global stylesheet, not a CSS Module. Reference its classes as literal strings; do not duplicate one of its rules locally to avoid an import.
- A `.module.css` file that needs to combine its own scoped class with a `shared.css` (or another module's) class wraps the shared side in `:global(...)`, e.g. `.table-row:hover .table-row-actions :global(.btn) { opacity: 1; }`.
- Every styled `<button>` goes through `frontend/src/components/Button.tsx` (`kind`: cancel/confirm/danger; `variant`: page/modal/banner/table/confirmation) — do not hand-roll `className="modal-button-cancel"`-style strings on a raw `<button>`. Exception: bespoke one-off controls that don't fit the kind/variant shape (nav tabs, dropdown menu items, icon-only triggers, whole clickable cards) — see the ADR for the current list.

## Frontend localization

Applies to: `frontend/src/**/*.{ts,tsx}`.

Rationale: `docs/adr/frontend-localization.md`.

- No component hardcodes user-facing English text. Every string (JSX text, `aria-label`/`alt`/`title`/`placeholder`, a thrown/caught error message shown to the user, a `Table` column header) goes through `useTranslation(namespace)`'s `t()`, or `<Trans>` for text with embedded markup (a link, bold text).
- One JSON resource file per feature namespace under `frontend/src/locales/en/<namespace>.json` (`common`, `home`, `chat`, `knowledge-base`, `grammar`, `writing`, `preferences`, `admin`, `auth`). A component used from a single feature page keeps its strings in that feature's namespace; a component reachable from more than one feature (grep its import sites to check) goes in `common` instead of duplicating its copy across namespaces.
- Within a namespace file, keys nest under the owning component's name (camelCase) — e.g. `{"homePage": {"loading": "..."}}` — so multiple components can share one namespace file without key collisions.
- Pass the namespace explicitly to `useTranslation()` at every call site (`useTranslation("home")`, or `useTranslation(["home", "common"])` when also reusing a `common` string like `t("common:actions.close")`) — never rely on a default namespace.
- `frontend/src/i18n.ts` inits synchronously from bundled JSON (no loading state); `frontend/src/test/setup.ts` imports it too, so tests assert on the real English strings via `t()` unchanged.
- Data catalogs, not UI chrome (e.g. `frontend/src/data/challenges.ts`, `data/chatCharacters.ts`), are deliberately left untranslated for now — see the ADR's "Out of scope" section before changing that judgment call.

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
