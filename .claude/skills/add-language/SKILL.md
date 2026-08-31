---
name: add-language description: >- Wires a new interface language into teacher-wang's existing react-i18next framework: translates every frontend/src/locales/en/*.json namespace into locales/<lang>/*.json, registers it in i18n.ts, maps the language code to a display name in behavior_spec.py for Teacher Wang's chat behaviors, validates end-to-end, and optionally loads translated HSK word definitions via the teacher-wang-grammar repo's add-translation skill. Use when the user asks to add a new language, add French/Spanish/etc. localization, register a locale, finish/extend translations to another language, or load HSK translations for a language.
---

# Add a new language

Wire a new interface language into the localization framework that already exists (`docs/adr/frontend-localization.md`). This is a "translate everything, register it, validate it" workflow — the framework itself (react-i18next, namespace-per-feature structure, the `users.language` column, Teacher Wang's `{language}`-templated behaviors) is already built; do not rebuild it.

## Required input from the user

1. **Language code** — matches `users.language` values (e.g. `fr`, `es`, `de`). If the code already exists in `LANGUAGE_NAMES` (see Current state below), reuse it rather than inventing a new one.
2. **Display name** — the name used as Teacher Wang's meta-language, e.g. `French`, `Spanish` (this is what an LLM prompt sees, not UI chrome — keep it a plain English-alphabet language name).
3. Whether an actual translator/reviewer is doing the translation, or machine-translated placeholder text is acceptable for now — flag this clearly in your summary either way; never present unreviewed machine translation as reviewed.

## Current state (check before starting)

- `frontend/src/locales/en/` is the only locale directory with files — no other language has translated JSON yet.
- `backend/utils/aiChat/behavior_spec.py`'s `LANGUAGE_NAMES` already maps `"fr": "French"`, but nothing on the frontend consumes it yet. Finishing French end-to-end (Steps 1, 2, 4, 5 below — Step 3 is already done) is the natural first real run of this skill.
- `users.language` (Postgres, see `docs/architecture/schema-tenancy.md`) is an unconstrained `TEXT NOT NULL DEFAULT 'en'` — no CHECK constraint to update when adding a code.
- `App.tsx` reads `users.language` on login and calls `i18n.changeLanguage(user.language)`. A language switcher already exists in Preferences (`frontend/src/pages/PreferencesPage.tsx`'s `LANGUAGE_OPTIONS` array + `<select>`), backed by `PATCH /preferences/language` (`backend/routes/language_preference.py`), which validates the code against `LANGUAGE_NAMES` and writes `users.language`. **Adding a language must add its code to `LANGUAGE_OPTIONS` in `PreferencesPage.tsx`** or it won't be selectable from the UI even once translated.
- `hsk_words_translation` (Postgres, list-partitioned on `language`) already exists and every HSK-word-serving route already reads it (`hsk_translations()`/`serialize_word()` in `backend/routes/suggest_hsk_words.py`) for any language other than `en`, falling back to `hsk_words.definition`. It's just empty for languages that haven't gone through Step 6 below.

## Checklist

```
Language Progress:
- [ ] Frontend: locales/<lang>/*.json created for all 10 namespaces, mirroring en/ key structure
- [ ] Frontend: language registered in i18n.ts resources
- [ ] Frontend: language added to LANGUAGE_OPTIONS in PreferencesPage.tsx (language switcher)
- [ ] Backend: LANGUAGE_NAMES entry in behavior_spec.py (skip if already present)
- [ ] Key-parity check: every en key exists in the new language, no extras
- [ ] Frontend tests pass (npx vitest run --silent)
- [ ] Backend tests pass (python3 -m unittest discover -s backend/tests -q)
- [ ] Manually previewed the new language end-to-end
- [ ] HSK word translations loaded (optional content step — see Step 6)
- [ ] README roadmap box checked if the language is French
```

## Step 1 — Translate every namespace file

```
frontend/src/locales/en/{admin,auth,chat,challenge,common,grammar,home,knowledge-base,preferences,writing}.json
→ frontend/src/locales/<lang>/{same 10 filenames}
```

Copy the key **structure** exactly; translate only the **values**.

- Keep every key name identical to `en`. A key present in `en` and missing in `<lang>` silently falls back to English at runtime (`fallbackLng: "en"`) — harmless but incomplete. An extra key in `<lang>` not in `en` is dead weight.
- Keep `{{placeholder}}` interpolation tokens and i18next `_one`/`_other` plural suffixes byte-identical — translate the surrounding text, never the token/suffix names. If the target language's plural rules don't collapse to a plain one/other split (e.g. it needs `_few`/`_many`/`_zero`), use i18next's suffix set for that language rather than forcing English's two-way split.
- `<Trans>`-templated strings (e.g. `common.json`'s `helpButton.bubble`, `preferences.json`'s `currentPlan.descriptionFree`) keep their numbered placeholders (`<1>...</1>`) — translate the text around them, not the tags.
- `challenge.json` is a data catalog, not component copy (see the ADR's "Exception — data catalogs" note) — translate `title`/`description`/`character.name`/`character.description`/every `tasks.*` value; the file has nothing else to translate.

## Step 2 — Register the language in `i18n.ts`

File: `frontend/src/i18n.ts`

```ts
import adminFr from "./locales/fr/admin.json";
import authFr from "./locales/fr/auth.json";
// ...one import per namespace, per language — 10 new imports total

export const resources = {
  en: { /* existing, unchanged */ },
  fr: {
    common: commonFr,
    home: homeFr,
    chat: chatFr,
    challenge: challengeFr,
    "knowledge-base": knowledgeBaseFr,
    grammar: grammarFr,
    writing: writingFr,
    preferences: preferencesFr,
    admin: adminFr,
    auth: authFr,
  },
} as const;
```

`ns: Object.keys(resources.en)` already derives the namespace list from `en` — no change needed there. `lng`/`fallbackLng` stay `"en"` — the app only switches language at runtime via `i18n.changeLanguage()` (called from `App.tsx` on login, or from the Preferences switcher), never at init.

## Step 2b — Add the language to the Preferences switcher

File: `frontend/src/pages/PreferencesPage.tsx`

```ts
const LANGUAGE_OPTIONS = ["en", "fr", "<lang>"] as const;
```

Then add the matching display name to `preferencesPage.language.options.<lang>` in `frontend/src/locales/en/preferences.json` (and any other locale's `preferences.json` that already exists) — use the language's own endonym (e.g. `"es": "Español"`), not its English name. No other change is needed: the `<select>` renders `LANGUAGE_OPTIONS` directly, and `PATCH /preferences/language` (`backend/routes/language_preference.py`) validates the submitted code against `LANGUAGE_NAMES`, registered next in Step 3 — do that step too or picking the language in the switcher will save successfully client-side but be rejected by the backend with a 400.

## Step 3 — Backend meta-language name

File: `backend/utils/aiChat/behavior_spec.py`

```python
LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "<lang>": "<Display Name>",
}
```

Skip this step if the code is already present. This is what lets Teacher Wang's chat behaviors say e.g. "give the meaning in Spanish" instead of defaulting to English — see `docs/architecture/teacher-wang-behaviors.md`'s templating note and `get_behaviors()`/`get_behavior()` in the same file.

## Step 4 — Key-parity check

No automated CI check exists for this yet (a known gap — see the ADR's Drawbacks). Spot-check by diffing top-level key sets between `en` and the new language for every namespace:

```bash
cd frontend/src/locales
for f in en/*.json; do
  ns=$(basename "$f")
  python3 -c "
import json
a = set(json.load(open('en/$ns')).keys())
b = set(json.load(open('<lang>/$ns')).keys())
if a - b: print('$ns missing:', a - b)
if b - a: print('$ns extra:', b - a)
"
done
```

Top-level keys only — re-read a namespace file end-to-end if a nested mismatch is suspected (rare, since translators normally copy the whole structure).

## Step 5 — Tests

- Frontend: `cd frontend && npx vitest run --silent`. Adding a language must not change any existing test's output — tests render with `lng: "en"` (the default), so a new `resources.<lang>` block is inert until `i18n.changeLanguage()` is called. A test failure here means the `en` JSON was accidentally edited while copying structure.
- Backend: `python3 -m unittest discover -s backend/tests -q`. If you added a new `LANGUAGE_NAMES` entry, add a matching case to `backend/tests/test_behavior_spec.py` — mirror the existing `"fr"` assertions in `TestLanguageName`, `TestGetBehaviors`, and `TestGetBehavior` with your new code/name.

## Step 6 — HSK word translations (optional content step)

This is content, not UI chrome (see `docs/architecture/schema-tenancy.md`'s note on `hsk_words_translation`) — it's what makes `MissingHskCharactersModal`, the vocabulary suggestion list, and grammar-point new-words show translated definitions instead of falling back to English. It's a separate, larger effort from Steps 1–5 and can be done later, by someone else, or skipped if English-fallback definitions are acceptable for now.

1. **Add the language option to the upload modal.** File: `frontend/src/components/LoadHskTranslationModal.tsx` — add `<option value="<lang>">{t("admin:adminPage.loadTranslationModal.languageOptions.<lang>")}</option>` to the `<select>`, and add the matching `loadTranslationModal.languageOptions.<lang>` key (the display name) to `frontend/src/locales/en/admin.json` and any other locale's `admin.json` that already exists. `<lang>` must be exactly 2 lowercase letters — `backend/routes/upload_hsk_translation.py` rejects anything else with a 400.
2. **Generate the translated definitions in the `teacher-wang-grammar` repo.** From `../teacher-wang-grammar` (sibling checkout of this repo), run its `add-translation` skill for `<lang>`. It produces `voc_database_<lang>.json` at that repo's root — an array of `{"id": "word|pinyin", "definition": "..."}` entries, one per HSK vocabulary word, matching `hsk_words.id` — see that skill for its own rules (resuming a partial run, style/length limits, verification).
3. **Zip the output file.** `backend/routes/upload_hsk_translation.py` expects a zip containing exactly one `.json` file (any filename inside is fine):
   ```bash
   cd ../teacher-wang-grammar
   zip voc_database_<lang>.zip voc_database_<lang>.json
   ```
4. **Ask the user to load it.** This skill cannot upload the file itself — hand the zip's path back to the user and ask them to: open the app, go to **Admin** → HSK database section → **Load translation** button, pick the zip, select `<lang>` from the language dropdown (added in step 1 above), and submit. This upserts every entry into `hsk_words_translation` for that language (`POST /admin/hsk/translation`, admin-only).

## How to preview a language

1. **Quickest:** once Step 2b is done, log in and pick the language from the Preferences page switcher — it calls `i18n.changeLanguage()` immediately and persists via `PATCH /preferences/language`.
2. **Before Step 2b is done:** in `App.tsx`, temporarily change the post-login `i18n.changeLanguage(user.language)` call to hardcode `i18n.changeLanguage("<lang>")`, reload the dev server, preview, then revert before finishing.

## Do not reinvent

Already implemented — do **not** rebuild:

- The i18next framework itself, synchronous init, namespace-per-feature structure (`docs/adr/frontend-localization.md`)
- `users.language` column, default `'en'`, loaded on login (`docs/architecture/schema-tenancy.md`)
- The Preferences language switcher and `PATCH /preferences/language` (`PreferencesPage.tsx`, `backend/routes/language_preference.py`) — Step 2b adds an `<option>` to it, it doesn't rebuild it
- Teacher Wang's `{language}`-templated behaviors (`backend/utils/aiChat/behavior_spec.py`, `docs/architecture/teacher-wang-behaviors.md`)
- The `challenge.json` data-catalog pattern (`getChallenges(t)` in `frontend/src/data/challenges.ts`) — copy this shape if another data catalog needs localizing later, don't invent a new one
- `hsk_words_translation`, its `POST /admin/hsk/translation` upload endpoint, and the read-side join/fallback in every HSK-word-serving route (`docs/architecture/schema-tenancy.md`) — Step 6 populates this table for a language, it doesn't build the pipeline
- The `teacher-wang-grammar` repo's `add-translation` skill — Step 6 calls it, don't reimplement vocabulary translation logic here

## Out of scope (separate, larger roadmap items — do not expand this skill to cover them)

- Internationalizing backend-generated content beyond Teacher Wang's meta-language (grammar feedback, system messages, emails, exports)
- Internationalizing PostgreSQL-stored content beyond HSK word definitions — `frontend/src/data/chatCharacters.ts` (still deliberately untranslated — see the ADR's "Out of scope" section), challenge metadata once it moves to Postgres, predefined texts, help content
- Internationalizing S3-hosted static content (grammar lessons, onboarding guides)

If the user asks for one of these while running this skill, say so explicitly and point at the matching roadmap item rather than absorbing it into this workflow.

## Done criteria

- Every namespace under `frontend/src/locales/<lang>/` exists with the same keys as `en`, values translated
- `frontend/src/i18n.ts`'s `resources` includes the new language block
- `LANGUAGE_OPTIONS` in `PreferencesPage.tsx` includes the code, with a matching `preferencesPage.language.options.<lang>` display name
- `LANGUAGE_NAMES` in `behavior_spec.py` includes the code (if not already present), with a matching test case
- `npx vitest run --silent` and `python3 -m unittest discover -s backend/tests -q` both pass
- You previewed at least one page in the new language and saw no raw translation keys or unexpected English fallback text
- If the language is French, `README.md`'s roadmap box "Add French as the first additional language and validate the full localization workflow end-to-end" is checked
- If Step 6 was done: the language option was added to `LoadHskTranslationModal.tsx`, and the user was handed the zipped `voc_database_<lang>.json` with instructions to upload it via Admin → Load translation. If Step 6 was skipped, say so explicitly — HSK definitions will silently fall back to English for this language until it's done.
