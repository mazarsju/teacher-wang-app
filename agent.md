# Agent Instructions

## Repository navigation

After every AI-assisted change in this repository, update `README.md` so it reflects the current setup, commands, and project structure. Use `README.md` as the primary source of truth when orienting yourself in the codebase; keep `agent.md` aligned with it so agents can find their way through the repository faster.

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
