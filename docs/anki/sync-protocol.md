# Anki sync protocol

Orchestration rationale: [anki-sync ADR](../adr/anki-sync.md). AnkiConnect ownership: [anki-connect ADR](../adr/anki-connect.md). Coding boundary: `.cursor/rules/anki-boundary.mdc`.

## Deck kinds

| Kind | Meaning | Push payload | Pull effect |
| --- | --- | --- | --- |
| `mandarin_vocabulary` | Vocabulary notes | word → `writing` / `pinyin` / `definition` (+ optional custom fields) | Import missing words (and create characters when pinyin allows) |
| `mandarin_writing` | Writing practice | words with `writing_known` → `recto` (`definition (pinyin)`) / `verso` (the word) | Set `writing_known` on the matching local word |

Preferences store deck name, note type, and field mappings. `mandarin_vocabulary` additionally supports user-defined optional fields (title, description, mapped Anki field), stored as JSON in `settings`; each word carries its own `custom_fields` (id → value), set from the Add/Edit word modal and pushed as-is (pull direction ignores them). Sync is user-triggered from the UI (full, cancel, or partial selection), not a continuous background job.

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
   * `push_cards` — vocabulary: words with `anki_voc_sync=False`; writing: words with `writing_known=True, anki_writing_sync=False`, one card per word (`id`/`verso` = the word text, `recto` = `f"{definition} ({pinyin})"`);
   * `unsyncable` — writing: words missing a definition or pinyin, so no recto can be built;
   * local word/character snapshot (writing also sends `writing_known_words`) and pull `ignore_keys`.
2. Frontend loads current Anki notes for the mapped deck/fields.
3. Cards already present in Anki (same vocabulary `writing`, or writing `verso` key) are auto-marked synchronized — no duplicate notes.
4. Remaining pending cards are shown in the sync UI.
5. On confirm, frontend `addNotes`, then `POST /anki/sync/mark-synchronized` with succeeded and ignored ids (the word text, for both kinds).

## Pull details

1. Same sync-data + Anki notes snapshot as push.
2. Frontend diffs Anki notes against local state:
   * **Vocabulary** — Anki `writing` not in local words and not ignored; words longer than 10 characters are auto-ignored; cards missing resolvable pinyin for new characters go to `pull_missing`.
   * **Writing** — the Anki note's `verso` is matched directly against `words.word`: a match not yet `writing_known` becomes a pull card (`recto`/`verso` taken straight from the Anki note, no local reconstruction); a `verso` with no matching word goes to `pull_missing` (nothing to synchronize against).
3. On confirm, `POST /anki/sync/pull-apply` imports selected cards and stores ignore keys for the rest / cancel path.
4. Vocabulary import may create character rows from Anki pinyin; a character missing from the card's `pinyin` field is guessed from the HSK master reading (same `hskCharacterPinyin` fallback as `AddWordModal`), then from the user's own already-known reading for that character. A card whose `pinyin` field is non-blank but leaves a character unresolved goes to `pull_missing` up front. `apply_pull` re-derives pinyin server-side regardless — a card is only imported when every character resolves; otherwise it is **not** written to the database, `failed` is incremented, and the offending characters are collected (deduplicated) into the response's `failed_characters`, which the UI surfaces as an error listing those characters. Imported words are stored as already `anki_voc_sync=True`; `rebuild_characters_from_words` derives the new character rows from them (`character` carries no sync bookkeeping of its own — `words` is the sole source of truth for both pinyin and `writing_known`).
5. Writing import sets `writing_known=True` and `anki_writing_sync=True` on the matching word; a `verso` with no matching `Word` row counts as `failed` (impossible to synchronize). After the batch, `rebuild_characters_from_words` re-derives per-character `writing_known` for the KB character grid.

## Status model

* Per-deck status: `not_configured` | `not_synchronized` | `synchronized` (pending push, pending pull, or unsyncable writing words keep a configured deck `not_synchronized`).
* Backend status is DB-centric (Postgres; see [postgres ADR](../adr/postgres.md)); when AnkiConnect is reachable, the frontend may downgrade a “synchronized” deck if pull candidates exist.
* Overall Anki synchronization status becomes `synchronized` once **both** decks have been synchronized, and then stays sticky.

## Quick sync

`runAnkiQuickSync` pushes `synchronize_all` for vocabulary then writing (without per-deck AnkiWeb sync), then syncs AnkiWeb once if any notes were added. It does not run pull.
