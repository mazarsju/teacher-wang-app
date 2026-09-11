# Schema tenancy reference

Canonical decision and rationale: [data isolation ADR](../adr/data-isolation.md). Coding invariants: `.cursor/rules/multi-tenant.mdc`.

## The `users` table

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | Cognito `sub` (stable across username/email changes) |
| `shortid` | `NUMERIC NOT NULL UNIQUE` | Auto-increment via `users_shortid_seq` (omit on insert; Postgres assigns). Tenant key for private tables |
| `username` | `TEXT NOT NULL UNIQUE` | From the access token `username` / `cognito:username` claim |
| `email` | `TEXT NOT NULL UNIQUE` | From a verified ID token when the client sends one; otherwise the unique placeholder `{sub}@users.local` |
| `plan` | `TEXT NOT NULL DEFAULT 'free'` | Billing tier hook |
| `language` | `TEXT NOT NULL DEFAULT 'en'` | Preferred interface language; loaded into `i18next` on login via `GET /auth/me` (see [frontend localization ADR](../adr/frontend-localization.md)) |
| `last_connexion` | `TIMESTAMPTZ NOT NULL` | Refreshed on every authenticated request |

## Private tables (`user_id` FK → `users.shortid`, hash-partitioned, modulus 8)

| Table | Primary key |
| --- | --- |
| `character` | `(user_id, char)` |
| `words` | `(user_id, word)` |
| `settings` | `(user_id, key)` |
| `ignore_vocab_card` | `(user_id, writing)` |
| `ignore_writing_card` | `(user_id, recto)` |
| `ignore_hsk_words` | `(user_id, writing)` |
| `token_count` | `(user_id, recorded_at, type)` |
| `challenge_progress` | `(user_id, challenge_scenario)` |
| `writing_progress` | `(user_id, writing_topic)` — `writing_topic` FK → `writing_practice.id`; `status` (`TEXT`, `WIP`/`DONE`, default `WIP`) |
| `listening_progress` | `(user_id, id)` — `id` is a `BIGINT GENERATED ALWAYS AS IDENTITY` like `conversation_summary.id`; `listening_topic` FK → `listening_practice.id`, `vocabulary_score`/`grammar_score` (`INTEGER`, percentage of the topic's characters/grammar rules already known), `status` (`TEXT`, default `TODO`) |
| `conversation_summary` | `(user_id, id)` — `id` is a `BIGINT GENERATED ALWAYS AS IDENTITY`, unique on its own; `conversation_id` (= character id) + `latest` are queried, not part of the PK |
| `user_grammar_progress` | `(user_id, grammar_id)` — `grammar_id` FK → `grammar_points.id` |

Character↔word membership is derived at read time (a word contains its characters as substrings); there is no association table.

## Shared tables (no `user_id`)

`hsk_words`, `hsk_characters`, `hsk_word_character` — not partitioned. They are loaded once at boot (`database.init_db`) and only ever read by the app.

`hsk_words_translation` — `(hsk_word_id, language)` PK, `hsk_word_id` FK → `hsk_words.id`, `translate` (`VARCHAR(200)`, the translated `hsk_words.definition`). List-partitioned on `language` (not hash) since every read filters on exactly one language and languages are added one at a time (see [frontend localization ADR](../adr/frontend-localization.md), roadmap item 11); a `DEFAULT` partition catches any language without a dedicated partition yet. Adding a language means a migration adding `CREATE TABLE hsk_words_translation_<lang> PARTITION OF hsk_words_translation FOR VALUES IN ('<lang>')`.

Every route that serializes `hsk_words` rows (`/hsk-words/suggestions`, `/hsk-words/next`, `/hsk-words/ignore`, `/hsk-characters/<char>/words`, and the `new_words` field of `/grammar-points/<id>`) resolves `definition` through `hsk_translations()`/`serialize_word()` in `backend/routes/suggest_hsk_words.py`: for `current_user().language == "en"` it skips the join entirely and returns `hsk_words.definition` as-is; for any other language it batch-queries `hsk_words_translation` for the requested word ids and that language, falling back to `hsk_words.definition` per-word when no translation row exists. This is a partial implementation of roadmap item 11's "Internationalize application data stored in PostgreSQL" step — HSK definitions only; challenge metadata, predefined texts, and help content are still untranslated.

`weekly_articles` — `id` (`BIGINT` PK, autoincrement), unique on `(week, year, hsk_level)`. Holds the 3 LLM-picked China-news articles adapted to that HSK level, written by `run_weekly_article_generation()` (`backend/utils/generateArticle/service.py` → `weekly_article_generator.py`); refreshing overwrites the current week's row per level via upsert.

`grammar_points` / `grammar_prerequisites` — grammar rule catalog. `grammar_points.id` is `"{hsk_level}|{title}"`; `s3_key` is the rule's folder key (e.g. `hsk1/01-basic-sentence-structure`) in the `GRAMMAR_CONTENT_S3_BUCKET` bucket (see [teacher-wang-grammar](https://github.com/mazarsju/teacher-wang-grammar)). `grammar_prerequisites` is a `(grammar_id, prerequisite_id)` association table, both FK → `grammar_points.id`. `POST /admin/grammar/reload` clears and repopulates both, plus `writing_practice` (see below), from every `grammar.yaml`/`overview.yaml` in the bucket (`backend/utils/grammar/grammar_content_loader.py`), then rewrites `user_grammar_progress` rows whose `grammar_id` still exists (dropped or renamed ids are discarded); set `GRAMMAR_CONTENT_S3_PATH` to a local `teacher-wang-grammar`-layout checkout to reload from disk instead, for local debugging without AWS credentials. Decision notes: [grammar content architecture](../adr/grammar-content.md).

`writing_practice` — `id` (`TEXT` PK, e.g. `writing-present-yourself`), `title`, `after_grammar_point` (FK → `grammar_points.id`, the curriculum point this topic follows). Populated the same way as `grammar_points`, from every `writing_practice/<name>/overview.yaml` in the same bucket, in the same `POST /admin/grammar/reload` pass — cleared and reinserted before `grammar_points` is cleared, since it FKs into it. Read by `GET /grammar-points` (returned as `writing_practices`, replacing what used to be a hardcoded frontend array) and `GET /writing-practice/<id>` (that row plus its sibling `context.md` from S3); see the [writing practice ADR](../adr/writing-practice.md).

`listening_practice` — `id` (`TEXT` PK, e.g. `listening-family-size`), `title`, `hsk_level`, `grammar_rules` (comma-separated `grammar_points.id` values the topic covers), `unique_chars` (every unique Chinese character in the topic's transcript, concatenated, no separator). Populated by its own `POST /admin/listening/reload` (`backend/utils/listening/listening_content_loader.py`), a separate clear-and-repopulate pass from every `listening_practice/<hskN>/<name>/overview.yaml` (+ sibling `text.txt`) in the same grammar-content bucket — `grammarIds` in each `overview.yaml` is validated against `grammar_points` already in the database, so `POST /admin/grammar/reload` must have populated it at least once first. `listening_practice/` sits alongside `writing_practice/` in the bucket and reuses the same `overview.yaml` suffix, so both loaders filter to their own folder prefix rather than each other's.

`GET /listening-practices` and `POST /listening-practices/refresh` (`backend/utils/listening/listening_progress.py`) are the learner-facing side. Both scope `listening_practice` to `hsk_level <= speaking_hsk_level_from_current(get_stored_current_hsk_level(user_id))` — the same "achieved level + 1" visibility rule `GrammarPage` applies to grammar points, backend-enforced here instead of client-filtered. `refresh` recomputes, for each visible topic: `vocabulary_score` = percentage of `unique_chars` present in the caller's `character` rows (reading knowledge base, same set `get_hsk_level_status` uses); `grammar_score` = percentage of the comma-separated `grammar_rules` whose `user_grammar_progress.status` is `DONE` or `MASTERED`. A topic with no characters/no rules scores 100 on that axis (vacuously complete) rather than 0. A topic opened for the first time gets a `TODO` row; an existing row's `status` is left alone (only the two scores are recomputed) since status transitions are a separate, not-yet-built concern. The frontend calls `refresh` once per login (`App.tsx`'s post-auth effect, fire-and-forget) so scores reflect the latest knowledge-base/grammar state without the learner having to act first. `ListeningPage`'s mosaic sorts topics by `vocabulary_score + grammar_score` (an "overall score" computed client-side, never persisted) and colors each tile's badge by a 4-tier threshold on that sum.

`GET /listening-practices/<id>` (`backend/routes/get_listening_practice.py`) returns one topic's detail: the Postgres row, its full `text.txt` transcript, and a per-sentence breakdown (`fetch_listening_breakdown`, `backend/utils/listening/listening_content_loader.py`) — `[{id, mandarin, translation}]`, `mandarin` from `breakdown.json`'s own `mandarin` field (the `transcript` field's `[emotion]` tag stripped, not returned), `translation` merged from `breakdown_<language>.json` (`{"sentences": [{"id", "translate"}]}`) for the caller's language, falling back to `breakdown.json`'s own `english` field — same per-sentence-id merge, same translation-sibling fallback convention as the rest of this module. `segment_count` is the number of `audio/audio-<n>.mp3` files found (`list_listening_audio_segments`), returned separately from `sentences.length` as a defensive signal in case content authoring ever lets the two drift; the frontend takes `Math.min` of both when pairing a shadowing row to its audio clip. Two further routes stream the binary clips authenticated (the app has no presigned-URL path, so this is proxied like every other piece of S3 content here, just as bytes instead of text): `GET /listening-practices/<id>/audio` (full `audio.mp3`) and `GET /listening-practices/<id>/audio/<segment>` (one `audio/audio-<segment>.mp3`), both `audio/mpeg`, `404` when the file is missing. The frontend can't point a plain `<audio src>` at these (no way to attach the `Authorization` header to it), so `AudioPlayer.tsx` fetches the bytes via `apiFetch` and plays them from a `URL.createObjectURL` blob instead — see the [grammar content ADR](../adr/grammar-content.md) for the full detail-page shape (shadowing, blurred transcript, STT reuse).

## Partitioning mechanics

SQLAlchemy models declare plain tables; they do not know about partitions. Partitioning lives in raw SQL inside the Alembic revision:

```sql
CREATE TABLE settings (
    user_id NUMERIC NOT NULL REFERENCES users (shortid),
    key VARCHAR(64) NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
) PARTITION BY HASH (user_id);

CREATE TABLE settings_p0 PARTITION OF settings
    FOR VALUES WITH (MODULUS 8, REMAINDER 0);
-- … p1 … p7
```

Modulus 8 is a compromise for the "tens to low hundreds of users" posture: enough to spread hot tables, few enough to keep planning cheap. Changing it means a new migration that rewrites the partition set. Switching the partition key from Cognito `sub` to `shortid` also requires rewriting the partition set (see revision `d5e6f7a8b9c0`).

`hsk_words_translation` is the one exception to hash-partitioning: it uses `PARTITION BY LIST (language)` because the partition key has a small, slowly-growing set of known values and every query already filters on one exact value, so list partitioning gives real pruning where hash would not:

```sql
CREATE TABLE hsk_words_translation (
    hsk_word_id VARCHAR(128) NOT NULL REFERENCES hsk_words (id),
    language VARCHAR(3) NOT NULL,
    translate VARCHAR(200) NOT NULL,
    PRIMARY KEY (hsk_word_id, language)
) PARTITION BY LIST (language);

CREATE TABLE hsk_words_translation_en PARTITION OF hsk_words_translation FOR VALUES IN ('en');
CREATE TABLE hsk_words_translation_default PARTITION OF hsk_words_translation DEFAULT;
```

## Target shape

```text
One RDS PostgreSQL database
├── users                     -- PK = Cognito sub; shortid = private-table tenant key
├── private tables            -- user_id (= shortid) first in the PK, PARTITION BY HASH (user_id) MODULUS 8
└── hsk_*                     -- shared, read-only for the app role (hsk_words_translation: PARTITION BY LIST (language))
```
