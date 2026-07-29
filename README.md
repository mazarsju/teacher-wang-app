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

- **Backend:** Python, Flask, SQLAlchemy, SQLite
- **Frontend:** React, TypeScript, Vite
- **Desktop:** Tauri 2 (native shell) + PyInstaller sidecar for the Flask API
- **AI:** LangChain (`langchain-core`, `langchain-openai`), OpenAI-compatible chat models via `ChatOpenAI`

## Project structure

```
teacher-wang/
├── backend/
│   ├── __init__.py         # Application factory (create_app)
│   ├── app.py              # Flask entry point
│   ├── database.py         # SQLite configuration and initialization
│   ├── extensions.py       # SQLAlchemy extension
│   ├── anki_sync.py        # Anki deck mapping status and SQLite sync helpers
│   ├── llm.py              # LangChain LLM integration (get_llm)
│   ├── llm_config.py       # Read/write LLM settings in .config.txt
│   ├── chat_agents.py      # Chat character prompts
│   ├── chat_service.py     # LLM chat reply generation
│   ├── conversation_logs.py
│   ├── hsk.json            # Bundled HSK fallback if GitHub download fails
│   ├── models.py           # Character, Word, HskWord, HskCharacter, and association tables
│   ├── settings.py         # Key/value app settings (HSK level, Anki deck mappings)
│   ├── routes/             # One endpoint per file (Flask blueprints); HSK load helpers
│   ├── teacher_wang.db     # SQLite database (created on first run)
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── public/
│   │   └── anki-connect/   # Illustrative AnkiConnect setup guide images
│   ├── src/
│   │   ├── App.tsx         # App shell and page routing
│   │   ├── main.tsx        # React entry point
│   │   ├── pages/          # Home, Knowledge base, Chat, Preferences
│   │   ├── components/
│   │   ├── types/
│   │   └── utils/
│   │       ├── anki/           # AnkiConnect client + sync orchestration
│   │       ├── knowledgeBase/  # Words, characters, HSK helpers
│   │       └── aiChat/         # Chat, LLM config, token usage
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts      # Vite dev server and proxy config
│   └── src-tauri/          # Tauri desktop shell (Rust) + sidecar wiring
├── scripts/
│   ├── build-sidecar.sh   # Bundle Flask API with PyInstaller for Tauri
│   └── build-desktop.sh   # Full local desktop installer build
├── docs/
│   ├── screenshots/        # UI screenshots used in this README
│   ├── anki-connect/       # AnkiConnect setup guide images (mirrors frontend/public)
│   ├── anki-connect-archi-decision.md
│   ├── anki-sync-archi-decision.md
│   └── ai-agents-archi-decision.md
├── agent.md
└── README.md
```

## Architecture decisions

Longer design notes live under `docs/`:

- [AnkiConnect bridge](docs/anki-connect-archi-decision.md) — why the React client talks to local AnkiConnect instead of AnkiWeb
- [Anki ↔ knowledge-base sync](docs/anki-sync-archi-decision.md) — push / pull orchestration, deck kinds, ignore lists
- [Multi-agent chat](docs/ai-agents-archi-decision.md) — character, grammar teacher, and challenge judge collaboration

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

From the project root (requires the project virtual environment at `venv/` with dependencies installed):

```bash
python3 -m unittest discover -s backend/tests -v
python3 backend/test_coverage.py
```

From the `backend/` directory:

```bash
make test-coverage
```

The coverage report is written to `backend/coverage/` (open `coverage/index.html` in a browser for the HTML report).

#### Database

On first start, a SQLite database is created at `backend/teacher_wang.db` with the following tables:

| Table | Columns |
| --- | --- |
| `character` | `char` (PK), `pinyin` (max 6 chars), `writting_known` (boolean), `synchronized` (boolean, default false), `updated_at` (datetime) |
| `words` | `word` (PK, max 10 chars), `definition` (max 100 chars, nullable), `synchronized` (boolean, default false), `updated_at` (datetime) |
| `character_word` | many-to-many link between `character` and `words` |
| `hsk_words` | `word` (PK), `level` (integer, HSK 3.0 level 1–7), `frequency` (integer) |
| `hsk_characters` | `character` (PK, single Han character), `level` (integer, HSK 3.0 level 1–7), `frequency` (integer) |
| `hsk_word_character` | many-to-many link between `hsk_words` and `hsk_characters` |

Override the database file path with the `DATABASE_PATH` environment variable if needed.

You can preload characters and words with the bulk upload endpoint (see below), for example:

```bash
curl -X POST -F "file=@db.txt" http://127.0.0.1:5000/characters/bulk
```

#### LLM configuration

LLM settings are stored in `.config.txt` at the project root (gitignored). Values can also be provided through environment variables as a fallback.

| Key / variable | Description |
| --- | --- |
| `LLM_API_KEY` | API key for the LLM provider |
| `LLM_MODEL` | Model name to use (for example `gpt-4o-mini`) |

Use `backend.llm.get_llm()` to obtain a cached chat model instance. Configuration is read from `.config.txt` first, then from environment variables.

Example:

```bash
curl http://127.0.0.1:5000/llm-config
curl -X POST http://127.0.0.1:5000/llm-config \
  -H "Content-Type: application/json" \
  -d '{"LLM_API_KEY":"your-api-key","LLM_MODEL":"gpt-4o-mini"}'
```

#### AnkiConnect

Preferences can map knowledge-base decks to Anki through [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect):

| UI label | Kind | Required fields |
| --- | --- | --- |
| Mandarin vocabulary | `mandarin_vocabulary` | `writting`, `pinyin`, `definition` — deck type should support three directions (writting↔pinyin↔definition) |
| Mandarin writting | `mandarin_writting` | `recto` (definition (pinyin)), `verso` (characters) — writing practice only; only characters with “written known” are intended for this deck |

Anki must be running with the AnkiConnect add-on installed (code `2055492159`). The **frontend** talks to AnkiConnect at `http://127.0.0.1:8765` (deck listing, note creation, AnkiWeb sync). In AnkiConnect’s add-on config, set `webCorsOriginList` to `["*"]` (or include `http://localhost:5173`) so the app can call it from the browser/webview. Deck name, deck type, and field mappings are stored in the SQLite `settings` table via thin Flask routes.

Architecture notes: [AnkiConnect bridge](docs/anki-connect-archi-decision.md), [push / pull sync](docs/anki-sync-archi-decision.md).

#### API endpoints

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/llm-config` | Read LLM API key and model from `.config.txt` |
| `POST` | `/llm-config` | Update LLM API key and/or model in `.config.txt` |
| `GET` | `/anki/status` | Mandarin vocabulary/writting deck mapping status and pending push estimate (DB only; frontend adds AnkiConnect reachability) |
| `POST` | `/anki/decks/setup` | Persist a mandarin_vocabulary/mandarin_writting deck, deck type, and field mapping |
| `GET` | `/anki/sync/data/<kind>` | Push candidates, ignore keys, and local word/character snapshot for frontend sync orchestration |
| `POST` | `/anki/sync/mark-synchronized` | Mark words/characters synchronized after a frontend Anki push (or cancel) |
| `POST` | `/anki/sync/pull-apply` | Import pull cards into the knowledge base and/or record ignore keys |
| `POST` | `/chat` | Send a chat message to the selected AI character |
| `GET` | `/chat/history/<character_id>` | Load persisted chat history for a character |
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

The app runs at `http://localhost:5173`. Vite proxies API requests to the backend during development.

#### Tests

From the `frontend/` directory:

```bash
npm test
npm run test:coverage
```

The coverage report is written to `frontend/coverage/` (open `coverage/index.html` in a browser for the HTML report). On GitHub, badges in this README are updated automatically on each push to `main`, and the full HTML reports are published at [mazarsju.github.io/teacher-wang](https://mazarsju.github.io/teacher-wang/) ([frontend](https://mazarsju.github.io/teacher-wang/frontend/), [backend](https://mazarsju.github.io/teacher-wang/backend/)).

To enable the hosted report, go to **Settings → Pages** and set **Build and deployment → Source** to **Deploy from a branch**, then choose branch **`gh-pages`** and folder **`/ (root)`**. The workflow creates and updates that branch automatically.

### Desktop app (Tauri)

The desktop package wraps the React UI in a native window and runs the Flask API as a bundled sidecar, so end users do not need Python or Node installed.

#### Prerequisites (builders only)

1. [Rust](https://rustup.rs/) (`rustc` / `cargo`)
2. Platform tooling: Xcode Command Line Tools on macOS (`xcode-select --install`)
3. Node.js + npm (frontend)
4. Python venv with desktop deps:

```bash
python3 -m venv venv
source venv/bin/activate
python3 -m pip install -r backend/requirements-desktop.txt
cd frontend && npm install
```

#### Build a local installer

From the project root:

```bash
bash scripts/build-desktop.sh
```

Or from `frontend/`:

```bash
npm run tauri:build
```

On macOS, installers are written under `frontend/src-tauri/target/release/bundle/`:

- `macos/Teacher Wang.app`
- `dmg/Teacher Wang_<version>_<arch>.dmg`

Open the `.dmg` (or the `.app`) to run the packaged app. User data (SQLite DB, LLM config, conversation logs) is stored in the OS app-data directory, not inside the install bundle.

GitHub Actions release packaging can be added later on top of this same local build flow.

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

After connecting the application with your favourite LLM, discuss with predefined
chat agents to practice your level.

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

### 5. Packaging of the application

Make it easier for external users to install and play with the app

- [x] Package the application as a strandalone application using Tauri
- [ ] Integrate the packaging process directly in Gitlab using Gitlab actions