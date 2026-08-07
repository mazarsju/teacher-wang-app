# Anki sync protocol

Orchestration rationale: [anki-sync ADR](../adr/anki-sync.md). AnkiConnect ownership: [anki-connect ADR](../adr/anki-connect.md). Coding boundary: `.cursor/rules/anki-boundary.mdc`.

## Deck kinds

| Kind | Meaning | Push payload | Pull effect |
| --- | --- | --- | --- |
| `mandarin_vocabulary` | Vocabulary notes | word → `writting` / `pinyin` / `definition` | Import missing words (and create characters when pinyin allows) |
| `mandarin_writting` | Writing practice | characters with `writting_known` → `recto` / `verso` | Mark existing characters as `writting_known` |

Preferences store deck name, note type, and field mappings. Sync is user-triggered from the UI (full, cancel, or partial selection), not a continuous background job.

## Directions

* **Push** — Knowledge base → Anki. Frontend builds notes from pending cards, calls AnkiConnect `addNotes`, then tells the backend which ids succeeded or were intentionally skipped.
* **Pull** — Anki → Knowledge base. Frontend reads mapped Anki notes, computes cards not yet represented locally, and posts the chosen imports (plus ignore keys) to the backend.

Cancel / “do not sync” paths mark items synchronized or ignored **without** creating Anki notes or importing rows, so they stop appearing as pending.

## Shared actions

Both directions support:

* `synchronize_all` — apply every pending card in that direction;
* `cancel_all` — skip every pending card (mark synchronized on push; record ignore keys on pull);
* `partial` — apply only `selectedIds`; the rest are treated like cancel for that batch.

Optional AnkiWeb sync runs after a successful push that added notes (and once after quick sync that pushed both decks).

## Push details

1. Backend `GET /anki/sync/data/<kind>` returns:
   * `push_cards` from rows with `synchronized=False` (writing: only `writting_known` characters);
   * `unsyncable` writing characters that lack an eligible linked word;
   * local word/character snapshot and pull `ignore_keys`.
2. Frontend loads current Anki notes for the mapped deck/fields.
3. Cards already present in Anki (same vocabulary `writting`, or writing `verso` key) are auto-marked synchronized — no duplicate notes.
4. Remaining pending cards are shown in the sync UI.
5. On confirm, frontend `addNotes`, then `POST /anki/sync/mark-synchronized` with succeeded and ignored ids.
6. Writing push dedupes by `recto` and marks all Han characters on a verso when a note is created or skipped.

## Pull details

1. Same sync-data + Anki notes snapshot as push.
2. Frontend diffs Anki notes against local state:
   * **Vocabulary** — Anki `writting` not in local words and not ignored; words longer than 10 characters are auto-ignored; cards missing resolvable pinyin for new characters go to `pull_missing`.
   * **Writing** — Han characters on the verso that exist locally with `writting_known=false` become pull cards; unknown characters are `pull_missing` (cannot invent writing-known state without a KB row).
3. On confirm, `POST /anki/sync/pull-apply` imports selected cards and stores ignore keys for the rest / cancel path.
4. Vocabulary import may create character rows from Anki pinyin; a character missing from the card's `pinyin` field is guessed from the HSK master reading (same `hskCharacterPinyin` fallback as `AddWordModal`), then from the user's own already-known reading for that character. A card whose `pinyin` field is non-blank but leaves a character unresolved goes to `pull_missing` up front. `apply_pull` re-derives pinyin server-side regardless — a card is only imported when every character resolves; otherwise it is **not** written to the database, `failed` is incremented, and the offending characters are collected (deduplicated) into the response's `failed_characters`, which the UI surfaces as an error listing those characters. Imported words/characters are stored as already `synchronized=True`.
5. Writing import only flips `writting_known` (and `synchronized`) on existing characters.

## Status model

* Per-deck status: `not_configured` | `not_synchronized` | `synchronized` (pending push, pending pull, or unsyncable writing chars keep a configured deck `not_synchronized`).
* Backend status is DB-centric (Postgres; see [postgres ADR](../adr/postgres.md)); when AnkiConnect is reachable, the frontend may downgrade a “synchronized” deck if pull candidates exist.
* Overall Anki synchronization status becomes `synchronized` once **both** decks have been synchronized, and then stays sticky.

## Quick sync

`runAnkiQuickSync` pushes `synchronize_all` for vocabulary then writing (without per-deck AnkiWeb sync), then syncs AnkiWeb once if any notes were added. It does not run pull.
