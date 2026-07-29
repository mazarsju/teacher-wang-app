# Anki ↔ Teacher Wang Synchronization Logic

## Status

Accepted

## Context

Deck connectivity uses AnkiConnect from the React client (see [anki-connect-archi-decision.md](./anki-connect-archi-decision.md)). That leaves a second problem: how Teacher Wang’s knowledge-base database and the user’s Anki notes stay aligned without a shared Anki protocol on the backend.

Two mapped decks are supported:

| Kind | Meaning | Push payload | Pull effect |
| --- | --- | --- | --- |
| `mandarin_vocabulary` | Vocabulary notes | word → `writting` / `pinyin` / `definition` | Import missing words (and create characters when pinyin allows) |
| `mandarin_writting` | Writing practice | characters with `writting_known` → `recto` / `verso` | Mark existing characters as `writting_known` |

Preferences store deck name, note type, and field mappings. Sync is user-triggered from the UI (full, cancel, or partial selection), not a continuous background job.

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

### Directions

* **Push** — Knowledge base → Anki. Frontend builds notes from pending cards, calls AnkiConnect `addNotes`, then tells the backend which ids succeeded or were intentionally skipped.
* **Pull** — Anki → Knowledge base. Frontend reads mapped Anki notes, computes cards not yet represented locally, and posts the chosen imports (plus ignore keys) to the backend.

Cancel / “do not sync” paths mark items synchronized or ignored **without** creating Anki notes or importing rows, so they stop appearing as pending.

### Shared actions

Both directions support:

* `synchronize_all` — apply every pending card in that direction;
* `cancel_all` — skip every pending card (mark synchronized on push; record ignore keys on pull);
* `partial` — apply only `selectedIds`; the rest are treated like cancel for that batch.

Optional AnkiWeb sync runs after a successful push that added notes (and once after quick sync that pushed both decks).

### Push details

1. Backend `GET /anki/sync/data/<kind>` returns:
   * `push_cards` from rows with `synchronized=False` (writing: only `writting_known` characters);
   * `unsyncable` writing characters that lack an eligible linked word;
   * local word/character snapshot and pull `ignore_keys`.
2. Frontend loads current Anki notes for the mapped deck/fields.
3. Cards already present in Anki (same vocabulary `writting`, or writing `verso` key) are auto-marked synchronized — no duplicate notes.
4. Remaining pending cards are shown in the sync UI.
5. On confirm, frontend `addNotes`, then `POST /anki/sync/mark-synchronized` with succeeded and ignored ids.
6. Writing push dedupes by `recto` and marks all Han characters on a verso when a note is created or skipped.

### Pull details

1. Same sync-data + Anki notes snapshot as push.
2. Frontend diffs Anki notes against local state:
   * **Vocabulary** — Anki `writting` not in local words and not ignored; words longer than 10 characters are auto-ignored; cards missing resolvable pinyin for new characters go to `pull_missing`.
   * **Writing** — Han characters on the verso that exist locally with `writting_known=false` become pull cards; unknown characters are `pull_missing` (cannot invent writing-known state without a KB row).
3. On confirm, `POST /anki/sync/pull-apply` imports selected cards and stores ignore keys for the rest / cancel path.
4. Vocabulary import may create character rows from Anki pinyin (and cross-note pinyin guesses); imported words/characters are stored as already `synchronized=True`.
5. Writing import only flips `writting_known` (and `synchronized`) on existing characters.

### Status model

* Per-deck status: `not_configured` | `not_synchronized` | `synchronized` (pending push, pending pull, or unsyncable writing chars keep a configured deck `not_synchronized`).
* Backend status is DB-centric (Postgres locally; see [sqlite-to-postgres-archi-decision.md](./sqlite-to-postgres-archi-decision.md)); when AnkiConnect is reachable, the frontend may downgrade a “synchronized” deck if pull candidates exist.
* Overall Anki synchronization status becomes `synchronized` once **both** decks have been synchronized, and then stays sticky.

### Quick sync

`runAnkiQuickSync` pushes `synchronize_all` for vocabulary then writing (without per-deck AnkiWeb sync), then syncs AnkiWeb once if any notes were added. It does not run pull.

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
* Writing pull cannot create brand-new characters — vocabulary pull (or manual KB edits) must land first.
* Sticky overall “synchronized” status can hide later drift until the per-deck UI is opened; pending estimates still surface push backlog.

## Future evolution

A first-connection wizard (roadmap) can reuse the same push/pull primitives to bootstrap the knowledge base from an existing Anki collection, without changing the AnkiConnect bridge.
