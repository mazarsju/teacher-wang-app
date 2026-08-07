# Anki ↔ Teacher Wang Synchronization Logic

## Status

Accepted

## Context

Deck connectivity uses AnkiConnect from the React client (see [anki-connect ADR](./anki-connect.md)). That leaves a second problem: how Teacher Wang’s knowledge-base database and the user’s Anki notes stay aligned without a shared Anki protocol on the backend.

Two mapped decks are supported (`mandarin_vocabulary`, `mandarin_writing`). Preferences store deck name, note type, and field mappings. Sync is user-triggered from the UI (full, cancel, or partial selection), not a continuous background job. Deck field mappings and step-by-step push/pull rules: [sync protocol](../anki/sync-protocol.md).

## Decision

**Orchestration stays in the frontend; persistence stays in the backend.**

```
┌──────────────────┐     sync data / mark / pull-apply      ┌─────────────────┐
│ React (ankiSync) │ ◄────────────────────────────────────► │ Flask + SQL DB  │
└────────┬─────────┘                                        └─────────────────┘
         │
         │  findNotes / notesInfo / addNotes / sync
         ▼
   AnkiConnect → Anki
```

* **Push** — Knowledge base → Anki via AnkiConnect, then mark succeeded/skipped ids in the DB.
* **Pull** — Anki → Knowledge base via AnkiConnect diffs, then `pull-apply` imports / ignore keys.
* Cancel / partial / `synchronize_all` share the same batch model; quick sync is push-only for both decks.

Full numbered steps, status model, and quick sync behavior: [sync protocol](../anki/sync-protocol.md).

## Rationale

* Comparing note fields requires live Anki data; keeping that in the browser avoids teaching the Flask process AnkiConnect/CORS.
* `synchronized` flags and ignore tables give durable “already handled” state without writing a second copy of the Anki collection into the knowledge-base DB.
* Explicit push vs pull keeps user intent clear: practice decks are not silently mutated, and the KB is not silently filled from Anki.
* Partial / cancel actions let learners curate what enters Anki or the KB instead of forcing an all-or-nothing merge.

## Consequences

### Advantages

* Clear UX: push cards out, pull cards in, or ignore.
* Backend remains testable without Anki running.
* Duplicate detection on push prevents double notes when flags drift.
* Ignore lists stop noisy Anki-only cards from reappearing every session.

### Drawbacks

* Sync requires Anki Desktop + AnkiConnect on the same machine.
* Frontend owns non-trivial diff logic; backend and frontend helpers must stay aligned (pinyin pairing, verso significant part, field maps).
* Writing pull cannot create brand-new words — vocabulary pull (or manual KB edits) must land first.
* Sticky overall “synchronized” status can hide later drift until the per-deck UI is opened; pending estimates still surface push backlog.

## Future evolution

A first-connection wizard (roadmap) can reuse the same push/pull primitives to bootstrap the knowledge base from an existing Anki collection, without changing the AnkiConnect bridge.
