# Web Application + AnkiConnect Architecture

## Status

Accepted

## Context

Teacher Wang helps users manage a Mandarin knowledge base and keep it aligned with their Anki decks, while also offering AI practice features.

A first idea was to connect the application backend directly to users' AnkiWeb accounts. That approach presents several issues:

* AnkiWeb does **not** provide a public OAuth flow or REST API.
* Synchronization relies on Anki's internal synchronization protocol, which is not intended for third-party integrations.
* Asking users for Anki credentials would create unnecessary security and maintenance concerns.
* Depending on Anki's private synchronization protocol would make the project fragile over time.

The product is a web app (React + Flask) with a PostgreSQL knowledge base, aimed at cloud hosting. Anki sync still needs the learner’s local Anki Desktop because there is no public AnkiWeb API.

## Decision

The application follows a hybrid architecture:

```
Browser (React)
        │
        ├────────────► Backend (Python / Flask, cloud or local)
        │                    │
        │                    ├── AI features
        │                    ├── SQL knowledge base (PostgreSQL)
        │                    ├── Deck mapping settings
        │                    └── Sync bookkeeping (synchronized flags, ignore lists)
        │
        └────────────► AnkiConnect (127.0.0.1:8765)
                               │
                               ▼
                           Anki Desktop
```

The React client is the only process that talks to AnkiConnect. The backend never opens Anki or AnkiWeb; it only stores knowledge-base data and deck configuration.

High-level directions (product terms):

* **Push** — Teacher Wang → Anki (create notes via AnkiConnect, then mark rows synchronized in the knowledge-base DB).
* **Pull** — Anki → Teacher Wang (read notes via AnkiConnect, then import into the knowledge-base DB).

Detailed push/pull rules live in [anki-sync-archi-decision.md](./anki-sync-archi-decision.md).

### Responsibility split

| Concern | Owner |
| --- | --- |
| Deck/model/field mapping persistence | Backend (`settings` + `/anki/decks/setup`) |
| Pending push candidates, local snapshot, ignore keys | Backend (`/anki/sync/data/<kind>`) |
| Mark synchronized / apply pull imports | Backend (`/anki/sync/mark-synchronized`, `/anki/sync/pull-apply`) |
| AnkiConnect reachability, note CRUD, AnkiWeb sync | Frontend (`frontend/src/utils/anki/`) |
| Diffing Anki notes vs the knowledge-base DB for push/pull UI | Frontend orchestration |

## Rationale

This architecture was chosen because it:

* avoids storing users' Anki credentials;
* relies only on the stable AnkiConnect API instead of Anki's private sync protocol;
* keeps AI and knowledge-base logic in the Flask app;
* requires no desktop companion besides Anki itself;
* remains compatible with cloud hosting of the web app while Anki sync stays on the learner’s machine.

## Consequences

### Advantages

* No custom Anki protocol to maintain.
* Backend stays independent from Anki internals and CORS.
* AI models and knowledge-base rules can evolve without touching AnkiConnect.
* Users keep full control of their local Anki collection.

### Drawbacks

* Anki Desktop must be running during synchronization.
* The AnkiConnect add-on must be installed, with `webCorsOriginList` allowing the app origin.
* Synchronization can only occur from the machine hosting the local Anki collection (browser must reach `localhost:8765`).
* Browser CORS and localhost access must stay valid on supported clients.
* A purely remote cloud UI can only sync Anki when the user runs AnkiConnect on the same machine as the browser (or via a future local bridge).

## Future evolution

If Anki eventually exposes an official API or OAuth authentication, this architecture can be revisited. Until then, cloud deployment covers the web app and database; Anki remains a local bridge via AnkiConnect.
