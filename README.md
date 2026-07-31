> 🚧 **Work in progress** — This repository is currently under active development. See the [roadmap](#roadmap) for planned features and progress.

# teacher-wang

![Frontend-Statements](.github/badges/frontend-coverage-statements.svg)
![Frontend-Branches](.github/badges/frontend-coverage-branches.svg)
![Frontend-Functions](.github/badges/frontend-coverage-functions.svg)
![Frontend-Lines](.github/badges/frontend-coverage-lines.svg)

![Backend-Statements](.github/badges/backend-coverage-statements.svg)
![Backend-Branches](.github/badges/backend-coverage-branches.svg)
![Backend-Functions](.github/badges/backend-coverage-functions.svg)
![Backend-Lines](.github/badges/backend-coverage-lines.svg)

An app to learn Mandarin.

## Technologies

This project was intentionally developed using Cursor AI and coding agents. My objective was not only to build an AI product, but also to explore modern AI-assisted software engineering workflows.

- **Backend:** Python, Flask, SQLAlchemy, PostgreSQL (Alembic)
- **Frontend:** React, TypeScript, Vite, Redux Toolkit
- **AI:** LangChain (`langchain-core`, `langchain-openai`), OpenAI-compatible chat models via `ChatOpenAI`

## Project structure

```
teacher-wang/
├── backend/
│   ├── Dockerfile          # ECS image (gunicorn :5000); build from repo root
│   ├── .dockerignore
│   ├── __init__.py         # Application factory (create_app)
│   ├── app.py              # Flask entry point
│   ├── database.py         # DB init, Alembic upgrade (Postgres)
│   ├── alembic_runner.py   # Alembic Config helper (URL via attributes; safe for % in passwords)
│   ├── db_config.py        # Resolve DATABASE_URL or ECS DB_* vars
│   ├── extensions.py       # SQLAlchemy extension
│   ├── migrations/         # Alembic revisions (Postgres schema)
│   ├── anki_sync.py        # Anki deck mapping status and sync helpers
│   ├── llm.py              # LangChain LLM integration (get_llm)
│   ├── llm_config.py       # Local/dev read of .config.txt (never exposed via API)
│   ├── chat_agents.py      # Chat character prompts
│   ├── chat_service.py     # LLM chat reply generation
│   ├── conversation_logs.py
│   ├── conversation_log_storage.py  # Local / S3 adapters (users/{sub}/…)
│   ├── challenge_progress.py
│   ├── hsk.json            # Bundled HSK fallback if GitHub download fails
│   ├── models.py           # Character, Word, HskWord, HskCharacter, and association tables
│   ├── settings.py         # Key/value app settings (HSK level, Anki deck mappings)
│   ├── routes/             # One endpoint per file (Flask blueprints); HSK load helpers
│   └── requirements.txt
├── alembic.ini             # Alembic config (URL overridden from .env)
├── .env.example            # Template for local DATABASE_URL (copy to .env)
├── frontend/
│   ├── Dockerfile          # ECS image (nginx :80 + API reverse proxy)
│   ├── .dockerignore
│   ├── nginx/
│   │   └── default.conf.template  # Proxies API paths to BACKEND_UPSTREAM
│   ├── index.html
│   ├── package.json
│   ├── public/
│   │   └── anki-connect/   # Illustrative AnkiConnect setup guide images
│   ├── src/
│   │   ├── App.tsx         # App shell, auth gate, login/logout sync triggers
│   │   ├── main.tsx        # React entry + Redux Provider
│   │   ├── store/          # Redux Toolkit store (characters, words, HSK, Anki)
│   │   ├── pages/          # Welcome auth, Home, Knowledge base, Chat, Preferences
│   │   ├── components/     # Navbar, ProfileMenu (Synchro / Log out), modals, …
│   │   ├── types/
│   │   └── utils/
│   │       ├── apiBase.ts      # API_BASE = "/api" for Flask calls
│   │       ├── auth/           # Cognito auth client + apiFetch
│   │       ├── anki/           # AnkiConnect (localhost:8765) + /api/anki bookkeeping
│   │       ├── knowledgeBase/  # Words, characters, HSK helpers
│   │       └── aiChat/         # Chat, LLM config, token usage
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts      # Dev server; proxies /api → Flask (strip prefix)
├── scripts/
│   └── push-ecr.sh         # Build/push arm64 images to AWS ECR
├── docs/
│   ├── archived/           # Superseded architecture decisions (history)
│   ├── screenshots/        # UI screenshots used in this README
│   ├── anki-connect/       # AnkiConnect setup guide images (mirrors frontend/public)
│   ├── anki-connect-archi-decision.md
│   ├── anki-sync-archi-decision.md
│   ├── ai-agents-archi-decision.md
│   ├── postgres-archi-decision.md
│   ├── auth-archi-decision.md
│   └── data-isolation-archi-decision.md
├── agent.md
└── README.md
```

## Architecture decisions

Longer design notes live under `docs/`:

- [AnkiConnect bridge](docs/anki-connect-archi-decision.md) — why the React client talks to local AnkiConnect instead of AnkiWeb
- [Anki ↔ knowledge-base sync](docs/anki-sync-archi-decision.md) — push / pull orchestration, deck kinds, ignore lists
- [Multi-agent chat](docs/ai-agents-archi-decision.md) — character, grammar teacher, and challenge judge collaboration
- [PostgreSQL](docs/postgres-archi-decision.md) — Alembic schema, `DATABASE_URL` / `TEST_DATABASE_URL`
- [Authentication & credentials](docs/auth-archi-decision.md) — Cognito User Pool for credentials; thin Postgres profile by `sub`
- [Data isolation](docs/data-isolation-archi-decision.md) — `user_id` in every private primary key, hash partitions, shared HSK catalog

Obsolete decisions are kept under [`docs/archived/`](docs/archived/) (see `agent.md`), for example [SQLite → PostgreSQL](docs/archived/sqlite-to-postgres-archi-decision.md).

## Getting started

### Backend

From the project root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
python3 -m pip install -r backend/requirements.txt
python3 -m backend.app
```

The API runs at `http://localhost:5000` by default. Set the `PORT` environment variable to use a different port:

```bash
PORT=8080 python3 -m backend.app
```

#### Tests

Backend tests require PostgreSQL via `TEST_DATABASE_URL` (see `.env.example`). Create the test database once, then from the project root:

```bash
python3 -m unittest discover -s backend/tests -v
python3 backend/test_coverage.py
```

From the `backend/` directory:

```bash
make test-coverage
```

GitHub Actions starts a Postgres 15 service and sets `TEST_DATABASE_URL` automatically.

The coverage report is written to `backend/coverage/` (open `coverage/index.html` in a browser for the HTML report).

#### Database

Local development targets **PostgreSQL** via `DATABASE_URL` in a gitignored `.env` (copy from `.env.example`). Backend tests use a separate `TEST_DATABASE_URL` (for example `teacher_wang_test`) so they never touch your app data:

```bash
cp .env.example .env
# DATABASE_URL=.../teacher_wang
# TEST_DATABASE_URL=.../teacher_wang_test

PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang;'
PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres \
  -c 'CREATE DATABASE teacher_wang_test;'
python3 -m pip install -r backend/requirements.txt
python3 -m alembic upgrade head   # also runs automatically on app start
```

Schema is managed with **Alembic** (`backend/migrations/`). See [PostgreSQL](docs/postgres-archi-decision.md) for details.

On first start the app seeds the shared HSK content; each user's default settings are seeded on their first authenticated request.

Learner data is **private per user**: those tables start their primary key with `user_id` (the Cognito `sub`, FK → `users.id`) and are hash-partitioned on it (8 partitions). The HSK catalog is shared and unpartitioned. See [data isolation](docs/data-isolation-archi-decision.md).

| Table | Scope | Columns |
| --- | --- | --- |
| `users` | — | `id` (PK, Cognito `sub`), `username` (unique), `email` (unique), `plan` (default `free`), `last_connexion` |
| `character` | private | PK `(user_id, char)`, `pinyin` (max 8 chars), `writting_known` (boolean), `synchronized` (boolean, default false), `updated_at` (datetime) |
| `words` | private | PK `(user_id, word)` (max 10 chars), `definition` (max 100 chars, nullable), `synchronized` (boolean, default false), `updated_at` (datetime) |
| `character_word` | private | PK `(user_id, character_char, word)` — many-to-many link between `character` and `words` |
| `settings` | private | PK `(user_id, key)`, `value` (Anki mappings, HSK level, …) |
| `ignore_vocab_card` / `ignore_writting_card` | private | PK `(user_id, writting)` / `(user_id, recto)` — Anki pull ignore lists |
| `token_count` | private | PK `(user_id, recorded_at, type)`, `tokens`, `price` — LLM token usage events |
| `hsk_words` | shared | `word` (PK), `level` (integer, HSK 3.0 level 1–7), `frequency` (integer) |
| `hsk_characters` | shared | `character` (PK, single Han character), `level` (integer, HSK 3.0 level 1–7), `frequency` (integer) |
| `hsk_word_character` | shared | many-to-many link between `hsk_words` and `hsk_characters` |

You can preload your characters and words with the bulk upload endpoint (see below), for example:

```bash
curl -X POST -F "file=@db.txt" \
  -H "Authorization: Bearer $COGNITO_ACCESS_TOKEN" \
  http://127.0.0.1:5000/characters/bulk
```

#### LLM configuration (operators only — never exposed to users)

**Rule:** `LLM_API_KEY` and `LLM_MODEL` are infrastructure / operator secrets. They must **never** be readable or writable through the API or the frontend UI. There is no `/llm-config` endpoint.

| Key / variable | Description |
| --- | --- |
| `LLM_API_KEY` | API key for the LLM provider |
| `LLM_MODEL` | Model name to use (for example `gpt-4o-mini`) |

- **Production / ECS:** set these as task-definition secrets / environment variables in [teacher-wang-infra](https://github.com/mazarsju/teacher-wang-infra).
- **Local development:** the same env vars, or a gitignored `.config.txt` at the project root (read by `backend/llm_config.py` as a convenience fallback).

Use `backend.llm.get_llm()` to obtain a cached chat model instance. Values are read from `.config.txt` first (if present), then from environment variables.

#### AnkiConnect

Preferences can map knowledge-base decks to Anki through [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect):

| UI label | Kind | Required fields |
| --- | --- | --- |
| Mandarin vocabulary | `mandarin_vocabulary` | `writting`, `pinyin`, `definition` — deck type should support three directions (writting↔pinyin↔definition) |
| Mandarin writting | `mandarin_writting` | `recto` (definition (pinyin)), `verso` (characters) — writing practice only; only characters with “written known” are intended for this deck |

Anki must be running with the AnkiConnect add-on installed (code `2055492159`). The **frontend** talks to AnkiConnect at `http://127.0.0.1:8765` (deck listing, note creation, AnkiWeb sync). In AnkiConnect’s add-on config, set `webCorsOriginList` to `["*"]` (or include `http://localhost:5173`) so the app can call it from the browser. Deck name, deck type, and field mappings are stored in the `settings` table via thin Flask routes.

Architecture notes: [AnkiConnect bridge](docs/anki-connect-archi-decision.md), [push / pull sync](docs/anki-sync-archi-decision.md).

#### API endpoints

Every route below except `/health` requires `Authorization: Bearer <cognito_access_token>` (plus the optional `X-Id-Token` companion header) and only ever reads or writes the authenticated user's rows — see [data isolation](docs/data-isolation-archi-decision.md).

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check (`200` + DB up, or `503` if Postgres is unreachable) — the only public route |
| `GET` | `/auth/me` | Current user (`username`, `email`, `plan`) from the `users` row |
| `GET` | `/anki/status` | Mandarin vocabulary/writting deck mapping status and pending push estimate (DB only; frontend adds AnkiConnect reachability) |
| `POST` | `/anki/decks/setup` | Persist a mandarin_vocabulary/mandarin_writting deck, deck type, and field mapping |
| `GET` | `/anki/sync/data/<kind>` | Push candidates, ignore keys, and local word/character snapshot for frontend sync orchestration |
| `POST` | `/anki/sync/mark-synchronized` | Mark words/characters synchronized after a frontend Anki push (or cancel) |
| `POST` | `/anki/sync/pull-apply` | Import pull cards into the knowledge base and/or record ignore keys |
| `POST` | `/chat` | Send a chat message to the selected AI character (persists to the user-scoped log store) |
| `GET` | `/conversation-logs/<character_id>` | Load this user's chat transcript (and challenge task progress when applicable) |
| `POST` | `/conversation-logs/<character_id>` | Create an empty conversation log (`409` if it already exists) |
| `PATCH` | `/conversation-logs/<character_id>` | Replace the transcript (`{ "messages": [...] }`) |
| `DELETE` | `/conversation-logs/<character_id>` | Delete the transcript, correction threads, and challenge progress |
| `GET` | `/chat/history/<character_id>` | Legacy alias for `GET /conversation-logs/<character_id>` |
| `GET` | `/characters` | List all characters |
| `POST` | `/characters` | Create a new character |
| `PATCH` | `/characters/<char>` | Update a character's `pinyin` and `writting_known` |
| `DELETE` | `/characters/<char>` | Delete a character and its `character_word` links |
| `POST` | `/characters/bulk` | Upload a `.txt` file (`multipart/form-data`, field name `file`) |
| `GET` | `/words` | List all words |
| `POST` | `/words` | Create a new word and link it to existing characters |
| `PATCH` | `/words/<word>` | Update a word's `definition` |
| `DELETE` | `/words/<word>` | Delete a word and its `character_word` links |
| `GET` | `/hsk-characters` | List HSK characters with level and frequency |
| `GET` | `/hsk-characters/<character>/words` | List HSK words linked to a character |
| `POST` | `/database/export` | Export the knowledge base to a `.txt` file |

### Frontend

From the project root:

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`. Vite proxies `/api/*` to the backend (stripping the `/api` prefix) during development. AnkiConnect stays on `http://127.0.0.1:8765` (browser → local Anki); Flask Anki bookkeeping uses `/api/anki/…`.

#### Client state (Redux Toolkit)

Important learner data is kept in a Redux store so navigating between tabs does not re-hit the API for the same payload. On **login** (and when restoring an existing session), and when the user clicks **Synchro** in the profile menu (above Log out), the app refreshes:

| Slice | Source |
| --- | --- |
| Characters | `GET /characters` |
| Words | `GET /words` |
| HSK level | `GET /hsk-level` |
| Anki status | `GET /anki/status` (+ local AnkiConnect when available) |

Home, Knowledge base, and Preferences read from that store. Mutations (add / edit / delete) update the store after a successful API call. Logout clears the store. Chat transcripts, token-usage charts, and other ephemeral UI state are not cached this way. LLM credentials are never stored in Redux (see [LLM configuration](#llm-configuration-operators-only--never-exposed-to-users)).

#### Tests

From the `frontend/` directory:

```bash
npm test
npm run test:coverage
```

The coverage report is written to `frontend/coverage/` (open `coverage/index.html` in a browser for the HTML report). On GitHub, badges in this README are updated automatically on each push to `main`, and the full HTML reports are published at [mazarsju.github.io/teacher-wang](https://mazarsju.github.io/teacher-wang/) ([frontend](https://mazarsju.github.io/teacher-wang/frontend/), [backend](https://mazarsju.github.io/teacher-wang/backend/)).

To enable the hosted report, go to **Settings → Pages** and set **Build and deployment → Source** to **Deploy from a branch**, then choose branch **`gh-pages`** and folder **`/ (root)`**. The workflow creates and updates that branch automatically.

## AI logic

Chat turns are not a single LLM call: a character agent, grammar teacher, and (for challenges) a judge collaborate on each message. Full decision notes, including the interaction diagram, are in [docs/ai-agents-archi-decision.md](docs/ai-agents-archi-decision.md).

## Feature

### Track your progress

See at a glance where you stand on the HSK ladder—and exactly which characters still stand between you and the next level.

![Home](docs/screenshots/01-home.png)

### Update your knowledge base

Add characters and words in a clean edit view, then switch to a pinyin grid that turns your vocabulary into a visual map of progress.

![Knowledge base edit](docs/screenshots/03-knowledge-base-edit.png)

Browse every character you know, grouped by pinyin, for a motivating snapshot of how far you've come.

![Knowledge base view](docs/screenshots/02-knowledge-base-view.png)

### Practice your skills with AI agents

Discuss with predefined chat agents to practice your level (LLM access is
configured by the operator in infrastructure, not in the app UI).

![Preferences](docs/screenshots/06-preferences.png)

![Chat](docs/screenshots/04-chat.png)

![Chat with Waiter challenge](docs/screenshots/05-chat-challenge-waiter.png)

Step into real scenes: role-play with characters like the waiter, clear the checklist, and win the challenge in Mandarin.

## Roadmap

### 1. Character overview ordered by pinyin

An overall view of the characters you know, sorted by pinyin.

- [x] Simple frontend connected with backend
- [x] Database structure for characters, and loading the DB with characters you already know
- [x] Create different tabs in the frontend: Home, Knowledge base, Chat, Preferences
- [x] Simple CRUD interface to manage characters
- [x] Visualization of characters by pinyin
- [x] UI polish with additional options: different color for the tones, a toggle to show or hide characters you only recognize (not write), mouse hover effect...
- [x] Add home page with some progress KPIs

### 2. Chinese-only chatbot (known characters)

A chatbot that speaks Chinese using only the characters you are supposed to know.

- [x] LLM integration with config management
- [x] Minimalist UI to have a list of chats and navigate through them
- [x] AI chatbot remembering the previous answer (non-persistent through sessions)
- [x] AI chatbot remembering the previous answer (persistent through sessions)
- [x] Add constraint for the agent to use only the known vocabulary

### 3. Multi-agent conversations for specific topics

Several agents collaborating around focused learning scenarios.

- [x] Add a grammar checker for each conversation, explaining the mistakes to the user in a separate thread
- [x] Conversation scenarios with a defined goal to achieve

### 4. Anki integration

Ease the process of synchronization between the app knowledge base and Anki.

- [x] Add a connection to Anki in the setting section
- [x] Make it possible to add new characters / words to your Anki collection (way "out")
- [x] Make it possible to load your Anki collection to your current database (way "in")
- [ ] Add a whole wizzard for the first connexion to help the user to populate his knowledge base

### 5. Cloud deployment

Host the web app so learners can use it without a local install. Infrastructure lives in [teacher-wang-infra](https://github.com/mazarsju/teacher-wang-infra) (Terraform → VPC, RDS, ECR, optional ECS + ALB).

- [x] Separate frontend and backend container images (`frontend/Dockerfile`, `backend/Dockerfile`)
- [x] Script to build `linux/arm64` images and push to ECR (`scripts/push-ecr.sh`)
- [ ] Enable ECS in infra and wire LLM secrets / HTTPS

### 6. Multi-user auth & data isolation

Several learners can sign in; each owns private data, while shared catalogs stay read-only. Design notes: [auth](docs/auth-archi-decision.md), [data isolation](docs/data-isolation-archi-decision.md), infra [multi-user](https://github.com/mazarsju/teacher-wang-infra/blob/main/docs/multi-user-archi-decision.md).

- [x] Cognito User Pool in infra (app client; optional Google IdP) wired into ECS
- [x] Welcome auth UI — username/password login & sign-up, plus Google SSO (Hosted UI + PKCE)
- [x] Flask JWT verification on every route; `users` table keyed by Cognito `sub`
- [x] Per-user private tables (`user_id` in PK, hash-partitioned) with shared HSK catalog
- [x] Frontend attaches Cognito tokens on API calls; per-user conversation logs (S3 / local)
- [ ] PostgreSQL RLS as a backstop behind app-level filters
- [ ] Split `app` and `migrator` DB roles
- [ ] Enable Google IdP in Cognito (infra secrets + Google console redirect)

### 7. Improve UX/UI

Keep the app feeling snappy and polished as datasets and features grow — fewer round-trips, clearer feedback, smoother navigation, and a more cohesive look.

- [x] Cache core learner data in Redux so tab switches do not re-fetch (refresh on login / profile **Synchro**)
- [ ] Avatar design improvement
- [ ] General webapp design improvement

### 8. Plan management

Differentiate free and paid tiers so AI chat can scale without unbounded cost. The `users.plan` column already defaults to `free`.

- [ ] Lock the chat conversation feature on the free plan
- [ ] Add payment subscription (upgrade / renew / cancel)

#### Push images to AWS ECR (from this Mac)

ECS capacity uses Graviton (`t4g`) — images must be **`linux/arm64`** (native on Apple Silicon).

1. **Start the Docker daemon locally** (Docker Desktop on macOS). Wait until it is fully running — `docker info` should show a Server section:

```bash
open -a Docker
# wait for the whale icon to settle, then:
docker info
```

2. From **teacher-wang-infra** (once per shell):

```bash
cd environments/prod
source ../../config
export AWS_REGION="$(terraform output -raw aws_region)"
export ECR_BACKEND="$(terraform output -raw ecr_backend_repository_url)"
export ECR_FRONTEND="$(terraform output -raw ecr_frontend_repository_url)"
export COGNITO_REGION="$AWS_REGION"
export COGNITO_USER_POOL_ID="$(terraform output -raw cognito_user_pool_id)"
export COGNITO_APP_CLIENT_ID="$(terraform output -raw cognito_app_client_id)"
export COGNITO_ISSUER="$(terraform output -raw cognito_issuer)"
export COGNITO_DOMAIN="$(terraform output -raw cognito_domain)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$(echo "$ECR_BACKEND" | cut -d/ -f1)"
```

Prefer the skill wrapper (reads ECR + Cognito outputs for you):

```bash
# from teacher-wang-app
.cursor/skills/update-ecr-images/scripts/push.sh
```

3. Then from **this repo** (teacher-wang-app), if not using the wrapper:

```bash
./scripts/push-ecr.sh           # both images
./scripts/push-ecr.sh backend   # backend only
./scripts/push-ecr.sh frontend  # frontend only
```

Equivalent manual commands:

```bash
docker buildx build --platform linux/arm64 \
  -t "$ECR_BACKEND:latest" -t "$ECR_BACKEND:$(git rev-parse --short HEAD)" \
  -f backend/Dockerfile --push .

docker buildx build --platform linux/arm64 \
  -t "$ECR_FRONTEND:latest" -t "$ECR_FRONTEND:$(git rev-parse --short HEAD)" \
  -f frontend/Dockerfile \
  --build-arg "VITE_COGNITO_REGION=$COGNITO_REGION" \
  --build-arg "VITE_COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID" \
  --build-arg "VITE_COGNITO_APP_CLIENT_ID=$COGNITO_APP_CLIENT_ID" \
  --build-arg "VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN" \
  --build-arg "VITE_COGNITO_ISSUER=$COGNITO_ISSUER" \
  --push .
```

| Image | Container port | ECS host port | Runtime notes |
| --- | --- | --- | --- |
| Backend | 5000 | 5000 | gunicorn; `DB_*` + `COGNITO_*` from ECS task def; Docker `HEALTHCHECK` → `GET /health` (includes DB) |
| Frontend | 80 | 8080 | nginx; proxies **`/api/*`** → `BACKEND_UPSTREAM/*`; Cognito public ids baked at build (`VITE_COGNITO_*`); Docker `HEALTHCHECK` → `GET /health` |

Health endpoints:

| Service | URL | Meaning |
| --- | --- | --- |
| Backend | `http://<backend>:5000/health` | `{"status":"ok","service":"backend","database":"up"}` or `503` if DB is down |
| Frontend | `http://<frontend>/health` (ALB path `/health`) | `{"status":"ok","service":"frontend"}` — does not call the API |

Push images **before** (or right after) setting `enable_ecs = true` in infra, or tasks will fail to pull.
