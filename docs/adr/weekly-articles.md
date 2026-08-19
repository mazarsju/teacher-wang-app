# Weekly Articles Generation

## Status

Accepted

## Context

Learners benefit from real-world Chinese reading practice, not just chat. The app generates a small batch of China-related news reading material once a week, per HSK level, so learners on the Home page always have something current and pitched at their level.

News content and per-level adaptation both need an LLM: raw wire copy is in English, at adult-native complexity, and mixes topics of wildly different difficulty (a panda birth vs. a tax-policy story). A single fixed "top 3 articles" shared across every level could not serve HSK 1 and HSK 6 well at once.

The implementation lives in `backend/routes/generate_article.py` (fetch + trigger), `backend/routes/weekly_article_generator.py` (the pipeline), `backend/routes/weekly_articles.py` (learner-facing read), and the `weekly_articles` table (`backend/utils/database/models.py`, catalogued in [architecture/schema-tenancy.md](../architecture/schema-tenancy.md)).

## Decision

### Trigger and fetch

An admin manually triggers generation from Admin → **Refresh articles** (`frontend/src/pages/AdminPage.tsx`), which calls `POST /admin/articles/generate` (`403` for non-admins). The route fetches recent China-related news through `_fetch_china_articles`, which dispatches to one of two sources by the hardcoded `ARTICLE_SOURCE` flag in `backend/routes/generate_article.py` (not an env var — a code-level choice, so switching source is a one-line deploy, not a per-environment secret change):

| Source | Flag value | API key | Endpoint |
| --- | --- | --- | --- |
| The Guardian (current default) | `"guardian"` | `GUARDIAN_API_KEY` | Open Platform `/search` |
| Currents API | `"currents"` | `CURRENTS_API_KEY` | `/v1/search` |

Both keys are read the same way as `LLM_API_KEY` (`.config.txt` first, then the environment variable; see [LLM configuration](../../README.md#llm-configuration-operators-only--never-exposed-to-users)). Requests set an explicit `User-Agent`, since Cloudflare in front of these APIs blocks `urllib`'s default one as a bot signature.

`_fetch_from_guardian` and `_fetch_from_currents` both normalize their provider's response into the same shape before returning, so the rest of the pipeline never needs to know which source ran: `id`, `title`, `description`, and `category` (a list of tags — Currents' own `category` field, or The Guardian's single `sectionName` wrapped in a list). The whole pool (no pre-filtering) is handed to the pipeline below.

### Per-level pipeline

`generate_weekly_articles(articles)` runs the same three-step pipeline independently for **each HSK level 1-6**, so different levels can end up with entirely different source articles:

1. **Pick** (`_pick_articles_for_level`) — one LLM call given only the pool's *titles* (not descriptions), asked to choose the `ARTICLES_PER_LEVEL` (3) articles whose topic complexity best fits this level: simple, concrete topics (a sports result, the weather, a new metro line, a new panda at the zoo) for HSK 1-2; complex, abstract topics (geopolitics, economic strategy, tax policy, diplomacy) for HSK 5-6.
2. **Adapt** (`_adapt_articles_for_level`) — one LLM call turning that level's 3 picked articles (title + description) into Chinese reading material, guided by:
   - the level's [Teaching Strategy](../architecture/teacher-wang-teaching-strategy.md) instructions (same mechanism the chat agents use for language balance / vocabulary scope),
   - a per-level length guideline (`ARTICLE_LENGTH_GUIDELINES`, ~2 lines at HSK1 up to ~55-90 at HSK6),
   - and, only for the levels they apply to, three extra instructions (see table below): permission to loosen factual accuracy for readability, an instruction to drop proper nouns / organization names / technical terms unless necessary to follow the story, and — HSK 1-4 only — a hard list of the measure words (量词) allowed at that cumulative level (`MEASURE_WORDS_BY_LEVEL`, sourced from [AllSet Learning's HSK 1-4 Measure Words](https://resources.allsetlearning.com/chinese/vocabulary/HSK_1-4_Measure_Words)), so the model can't default to 个 for everything or reach for a measure word above the level.

   The response is a JSON object the model must match to the source articles 1:1, and each source article's `category` is copied onto the generated result server-side (`_normalize_article`) — the model never sees or invents it.
3. **Flag new words** (`_inject_new_words`, HSK 1-4 only) — a second LLM pass that reads the *already-generated* Chinese content back and lists vocabulary beyond HSK 1-`level`, as `{word, translation}` pairs. The LLM's flagging is then cross-checked against `hsk_words` (`_known_hsk_words`): any flagged word that's actually already in `hsk_words` at or below this level is dropped, since the model's own sense of "new" is a guess and `hsk_words` is the source of truth the rest of the app already uses for HSK-level computation. Levels 5-6 skip this whole step: reading material there is close to unrestricted vocabulary, so "new words" stops being a meaningful signal.

The result for each level is upserted into `weekly_articles` (`_save_weekly_article`, unique on `(week, year, hsk_level)`), so re-running generation mid-week overwrites that week's rows instead of duplicating them.

### Content shape

`weekly_articles.content` is a JSON list, one object per picked article:

| Field | Present when |
| --- | --- |
| `title`, `content` | always |
| `category` | the source article had one |
| `translation` | HSK 1-3, of `content` |
| `pinyin` | HSK 1-2, of `content` |
| `new_words` | HSK 1-4, and only if non-empty |

| HSK level | Length | Loose accuracy | Drop proper nouns | `translation` | `pinyin` | `new_words` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ~2 lines | yes | yes | yes | yes | yes |
| 2 | 3-8 lines | yes | yes | yes | yes | yes |
| 3 | 8-20 lines | — | yes | yes | — | yes |
| 4 | 20-35 lines | — | — | — | — | yes |
| 5 | 35-55 lines | — | — | — | — | — |
| 6 | 55-90 lines | — | — | — | — | — |

### Learner-facing read

`GET /weekly-articles` (`backend/routes/weekly_articles.py`) looks up the caller's stored HSK level (`get_stored_current_hsk_level`, defaulting to 1 when unset, clamped to 1-6) and returns the current ISO week's row for that level — `content: null` if nothing has been generated yet. The Home page's **Your weekly articles** section (`frontend/src/pages/HomePage.tsx`) fetches this on mount and renders each article as its own block: category tags, bold title, content (`white-space: pre-wrap`), pinyin underneath when present, then a "New words" pill list. `translation` is fetched but intentionally never rendered — it exists only as an internal fidelity aid for the low levels' looser retellings.

### Pipeline diagram

```text
Admin clicks "Refresh articles"
        │
        ▼
POST /admin/articles/generate
        │
        ▼
The Guardian or Currents API  (ARTICLE_SOURCE flag picks one)
        │
        ▼
article pool (id, title, description, category)
        │
        │  for each HSK level 1-6, independently:
        ▼
┌────────────────────────────────────────────────────────────┐
│ 1. Pick (titles only)                                      │
│    “which 3 articles suit HSK {level}’s topic complexity?” │
│     │                                                      │
│     ▼                                                      │
│ 2. Adapt (title + description of the 3 picked)             │
│    Teaching Strategy + length guideline                    │
│    + (HSK1-2) loose accuracy, (HSK1-3) drop proper nouns   │
│    + (HSK1-4) measure-word list for this level             │
│    → {title, content, translation?, pinyin?}               │
│    + category copied in from the source article            │
│     │                                                      │
│     ▼                                                      │
│ 3. Flag new words (HSK1-4 only)                            │
│    re-reads generated "content", lists vocabulary          │
│    beyond HSK 1-{level}                                    │
│    → drop any word already in hsk_words at/below {level}   │
│    → + new_words? (only if non-empty)                      │
└────────────────────────────────────────────────────────────┘
        │
        ▼
upsert weekly_articles (week, year, hsk_level)
        │
        ▼
GET /weekly-articles  ──►  Home page "Your weekly articles"
(caller's stored HSK level,    (title, content, pinyin, new words
 clamped 1-6)                   shown — translation fetched but never rendered)
```

## Rationale

* Picking per level (not once, globally) is what lets HSK1 read about a panda while HSK6 reads about tax policy in the same run, from the same article pool — a single shared "top 3" cannot serve both.
* Picking from titles only keeps that step cheap and mirrors how a human editor would triage a wire feed at a glance.
* Loosening factual accuracy at HSK 1-2 (explicitly allowed to be inspired-by rather than accurate) exists because faithful news retelling is often impossible in ~2-8 lines of HSK1-2 vocabulary — the alternative was unreadable, jargon-dense summaries.
* Dropping proper nouns/technical terms at HSK 1-3 avoids forcing a beginner to memorize a foreign name or an institution acronym just to follow an unrelated story.
* Constraining measure words (量词) to an explicit, cumulative per-level list at HSK 1-4 was added after observing the model otherwise defaulting to 个 for everything, or reaching for a measure word above the learner's level — an easy tell that reading material wasn't really level-appropriate. Listing the exact allowed words (rather than a vaguer "use simple measure words" instruction) gives the model no room to improvise past them.
* Flagging new words as a *second* LLM pass over the already-generated text (rather than asking for it in the same call) keeps the adaptation prompt focused on writing, and lets the new-words step reason about the model's own actual output instead of the source material.
* Cross-checking flagged new words against `hsk_words` exists because the model's sense of "this word is beyond HSK N" is a guess informed by general Chinese-teaching knowledge, not this app's actual HSK dataset — the two can disagree (see Drawbacks), and `hsk_words` is what the rest of the app (HSK-level computation, HSK word suggestions) already treats as ground truth.
* `category` is deliberately never generated by the LLM and never fed into the adaptation prompt — it is the source provider's own tag, copied through mechanically, so the frontend can label an article without asking the model to re-derive something already known.
* The source is a hardcoded flag, not an env var: which news provider runs is a code decision (only one is meant to run at a time, and it affects prompts/shape mapping indirectly through the normalized fields), whereas the API key is the per-environment secret — keeping them separate mirrors how `LLM_API_KEY`/`LLM_MODEL` are secrets but the model-selection *logic* itself lives in code.

## Consequences

### Advantages

* Every HSK level gets material genuinely suited to it, from a single news API pull.
* Swapping the news source is a one-line flag change (`ARTICLE_SOURCE`) with no impact on the rest of the pipeline, since both sources normalize to the same article shape.
* The pipeline reuses the same Teaching Strategy instructions the chat agents already use, so HSK-level language policy stays defined in one place.
* Refreshing mid-week is idempotent (upsert on `week, year, hsk_level`), so admins can safely re-run generation.
* The `hsk_words` cross-check removes false positives from the model's new-words guess for free (no extra LLM call), keeping the list aligned with the same dataset the app's own HSK-level computation trusts.

### Drawbacks

* One full refresh costs up to `6 levels × (1 pick + 1 adapt + 1 new-words for levels 1-4)` = 16 LLM calls.
* Neither source's free/default tier returns full article bodies — Currents gives a short `description`, The Guardian a `trailText` teaser — so "the original source" the low levels are inspired by is itself short; there is no longer-form source to fall back on.
* Quality depends on structured JSON parsing from the model at three separate steps per level, same class of risk as the chat pipeline ([multi-agent chat](ai-agents.md)).
* If the picker returns fewer than 3 ids (or ids outside the pool), that level simply gets fewer articles — there is no retry.
* The `hsk_words` cross-check only removes words the model *wrongly* flagged as new (false positives); it cannot add words the model *missed* (false negatives) — a genuinely-unknown word the model didn't notice still won't be flagged.
* Confining the model to an exact measure-word list can occasionally force an imperfect fit (e.g. using 块 for a medal at HSK1-2, where 枚 would be the natural native choice but isn't in the allowed list yet) — a deliberate trade-off of naturalness for staying within the learner's known vocabulary.

## Future evolution

If a paid Currents or Guardian plan (or another source) provides full article bodies, the "loose accuracy" instruction for HSK 1-2 could be revisited now that a real long-form source exists to summarize instead of embellish.
