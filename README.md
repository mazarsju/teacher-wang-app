> 🚧 **Work in progress** — This repository is currently under active development. See the [roadmap](#roadmap) for planned features and progress.

# learn-mandarin

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
- **AI:** LangChain (`langchain-core`, `langchain-openai`), OpenAI-compatible chat models via `ChatOpenAI`

## Project structure

```
learn-mandarin/
├── backend/
│   ├── __init__.py         # Application factory (create_app)
│   ├── app.py              # Flask entry point
│   ├── database.py         # SQLite configuration and initialization
│   ├── extensions.py       # SQLAlchemy extension
│   ├── anki_connect.py     # AnkiConnect HTTP client (localhost:8765)
│   ├── anki_sync.py        # Anki deck mapping status and setup
│   ├── llm.py              # LangChain LLM integration (get_llm)
│   ├── llm_config.py       # Read/write LLM settings in .config.txt
│   ├── chat_agents.py      # Chat character prompts
│   ├── chat_service.py     # LLM chat reply generation
│   ├── conversation_logs.py
│   ├── hsk.json            # Bundled HSK fallback if GitHub download fails
│   ├── models.py           # Character, Word, HskWord, HskCharacter, and association tables
│   ├── settings.py         # Key/value app settings (HSK level, Anki deck mappings)
│   ├── routes/             # One endpoint per file (Flask blueprints); HSK load helpers
│   ├── learn_mandarin.db   # SQLite database (created on first run)
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
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts      # Vite dev server and proxy config
├── docs/
│   ├── screenshots/        # UI screenshots used in this README
│   └── anki-connect/       # AnkiConnect setup guide images (mirrors frontend/public)
├── agent.md
└── README.md
```

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

On first start, a SQLite database is created at `backend/learn_mandarin.db` with the following tables:

| Table | Columns |
| --- | --- |
| `character` | `char` (PK), `pinyin` (max 6 chars), `writting_known` (boolean), `updated_at` (datetime) |
| `words` | `word` (PK, max 10 chars), `definition` (max 100 chars, nullable), `updated_at` (datetime) |
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

Anki must be running with the AnkiConnect add-on installed (code `2055492159`). The backend talks to `http://127.0.0.1:8765`. Setup stores the Anki deck name, deck type, and field mapping in the SQLite `settings` table.

#### API endpoints

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/llm-config` | Read LLM API key and model from `.config.txt` |
| `POST` | `/llm-config` | Update LLM API key and/or model in `.config.txt` |
| `GET` | `/anki/status` | AnkiConnect reachability and Mandarin vocabulary/writting deck mapping status |
| `GET` | `/anki/decks` | List deck names from AnkiConnect |
| `GET` | `/anki/models` | List deck types from AnkiConnect |
| `GET` | `/anki/models/<model>/fields` | List field names for a deck type |
| `POST` | `/anki/decks/setup` | Map a mandarin_vocabulary/mandarin_writting deck, deck type, and fields (optionally create the deck) |
| `POST` | `/anki/vocabulary/auto-setup` | Create a 3-direction Mandarin vocabulary deck type + deck (mapping is saved from the setup form) |
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

The coverage report is written to `frontend/coverage/` (open `coverage/index.html` in a browser for the HTML report). On GitHub, badges in this README are updated automatically on each push to `main`, and the full HTML reports are published at [mazarsju.github.io/learn-mandarin](https://mazarsju.github.io/learn-mandarin/) ([frontend](https://mazarsju.github.io/learn-mandarin/frontend/), [backend](https://mazarsju.github.io/learn-mandarin/backend/)).

To enable the hosted report, go to **Settings → Pages** and set **Build and deployment → Source** to **Deploy from a branch**, then choose branch **`gh-pages`** and folder **`/ (root)`**. The workflow creates and updates that branch automatically.

## AI logic

Chat turns in this app are not a single LLM call. Several specialized agents collaborate on each message, especially in challenge scenarios.

### Character agent

Each chat persona (friend, waiter, etc.) is a role-play agent with its own system prompt: situation, speaking style, and progression rules. In a **challenge**, that prompt encodes a fixed order of events (for example: call the waiter → order → eat → pay). The agent must stay in character, speak Chinese, and refuse out-of-order requests.

Wherever possible, the character also tries to use only Han characters from the learner’s **knowledge base**. After each reply, unknown characters are detected against that vocabulary. If any appear, the agent is asked to rephrase without them (up to **3** retries). If unknown characters remain, the app keeps the attempt that used the **fewest** unknown characters.

### Teacher agent (grammar)

For every non–Teacher Wang conversation, Teacher Wang silently reviews the learner’s latest Chinese message. If the grammar is wrong, a short correction is returned and opened in a side thread so the learner can ask follow-up questions without leaving the main chat.

### Challenge judge

After the character agent replies in a challenge, a **Challenge Judge** reviews the full turn and does two jobs:

1. **Task progress** — marks challenge tasks complete only when the learner attempted them in Chinese *and* the character cooperated (a refusal does not count).
2. **Coherence** — checks that the character’s reply fits the situation and scenario rules. If it does not, the judge explains why and asks the character to revise **once**. If the second answer is still incoherent, it is sent anyway; the judge cannot block a reply twice.

The exchange between judge and character (when a revision happens) is returned on the chat API as `judge_conversation`: it starts with the refused character reply, then the judge’s feedback (and a second judge note if the revision is still incoherent). The final character reply is only in `message.content`, not duplicated there. Only that final reply is stored in the learner-facing history.

### Interaction overview

```text
User
 │
 │  Chinese message
 ├──────────────────────────────► Teacher agent (grammar)
 │                                      │
 │                                      └──► correction thread
 │                                           (only if grammar is wrong)
 │
 │  same message (main chat)
 └──────────────────────────────► Character agent (role-play)
                                        │
                                        │ prefer known vocabulary;
                                        │ rephrase up to 3× if unknowns;
                                        │ keep attempt with fewest unknowns
                                        ▼
                                  Challenge judge
                                   /            \
                          coherent /              \ incoherent (1st time only)
                                  /                \
                                 ▼                  ▼
                          tasks + OK          explain why + ask to revise
                                 │                  │
                                 │                  ▼
                                 │            Character revises once
                                 │                  │
                                 │                  ▼
                                 │            Judge re-checks tasks
                                 │            (cannot block again)
                                 │                  │
                                 └────────┬─────────┘
                                          ▼
                                   User sees final reply
                                   (+ completed tasks;
                                    + judge_conversation if revised)
```

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
- [ ] Make it possible to load your Anki collection to your current database (way "in")
- [ ] Make it possible to add new characters / words to your Anki collection (way "out")
- [ ] Add a whole wizzard for the first connexion to help the user to populate his knowledge base

### 5. Packaging of the application

Make it easier for external users to install and play with the app

- [ ] TODO