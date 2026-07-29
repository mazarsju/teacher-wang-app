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

The app itself runs locally: a Flask API (dev server or Tauri sidecar) plus a React UI in the browser or a Tauri webview. There is no multi-tenant cloud Anki bridge.

## Decision

The application follows a hybrid local architecture:

```
Browser / Tauri webview (React)
        │
        ├────────────► Local Backend (Python / Flask)
        │                    │
        │                    ├── AI features
        │                    ├── SQL knowledge base (Postgres locally; SQLite for desktop/tests)
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
* requires no desktop companion besides Anki itself (or the optional Tauri shell);
* works the same in browser-dev and packaged Tauri builds, as long as Anki runs on the same machine;
* remains compatible with a future native client that could call AnkiConnect without a webview.

## Consequences

### Advantages

* No custom Anki protocol to maintain.
* Backend stays independent from Anki internals and CORS.
* AI models and knowledge-base rules can evolve without touching AnkiConnect.
* Users keep full control of their local Anki collection.

### Drawbacks

* Anki Desktop must be running during synchronization.
* The AnkiConnect add-on must be installed, with `webCorsOriginList` allowing the app origin.
* Synchronization can only occur from the machine hosting the local Anki collection.
* Browser/webview CORS and localhost access must stay valid on supported clients.

## Future evolution

If Anki eventually exposes an official API or OAuth authentication, this architecture can be revisited. A native desktop client could later reuse the same Flask API while replacing the webview-to-AnkiConnect bridge with direct local communication.
