---
name: add-language description: >- Wires a new interface language into teacher-wang's existing react-i18next framework: translates every frontend/src/locales/en/*.json namespace into locales/<lang>/*.json, registers it in i18n.ts, maps the language code to a display name in behavior_spec.py for Teacher Wang's chat behaviors, and validates end-to-end. Use when the user asks to add a new language, add French/Spanish/etc. localization, register a locale, or finish/extend translations to another language.
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
- No language-switcher UI exists yet. `App.tsx` reads `users.language` on login and calls `i18n.changeLanguage(user.language)`; there is no way to change it from the UI yet. See "How to preview" below for testing before that ships.

## Checklist

```
Language Progress:
- [ ] Frontend: locales/<lang>/*.json created for all 10 namespaces, mirroring en/ key structure
- [ ] Frontend: language registered in i18n.ts resources
- [ ] Backend: LANGUAGE_NAMES entry in behavior_spec.py (skip if already present)
- [ ] Key-parity check: every en key exists in the new language, no extras
- [ ] Frontend tests pass (npx vitest run --silent)
- [ ] Backend tests pass (python3 -m unittest discover -s backend/tests -q)
- [ ] Manually previewed the new language end-to-end
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

`ns: Object.keys(resources.en)` already derives the namespace list from `en` — no change needed there. `lng`/`fallbackLng` stay `"en"` — the app only switches language at runtime via `i18n.changeLanguage()` (called from `App.tsx` on login), never at init.

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

## How to preview a language before the switcher UI ships

1. **Quickest, local-only:** in `App.tsx`, temporarily change the post-login `i18n.changeLanguage(user.language)` call to hardcode `i18n.changeLanguage("<lang>")`, reload the dev server, preview, then revert before finishing — this skill adds the language, not the switcher.
2. **Closer to production:** update the logged-in test user's `users.language` row directly in Postgres (`UPDATE users SET language = '<lang>' WHERE id = '<cognito-sub>';`), then log in normally — `App.tsx` picks it up via `GET /auth/me` on login, no code change needed.

## Do not reinvent

Already implemented — do **not** rebuild:

- The i18next framework itself, synchronous init, namespace-per-feature structure (`docs/adr/frontend-localization.md`)
- `users.language` column, default `'en'`, loaded on login (`docs/architecture/schema-tenancy.md`)
- Teacher Wang's `{language}`-templated behaviors (`backend/utils/aiChat/behavior_spec.py`, `docs/architecture/teacher-wang-behaviors.md`)
- The `challenge.json` data-catalog pattern (`getChallenges(t)` in `frontend/src/data/challenges.ts`) — copy this shape if another data catalog needs localizing later, don't invent a new one

## Out of scope (separate, larger roadmap items — do not expand this skill to cover them)

- A language switcher UI, and a route to persist the choice back to `users.language` (roadmap: "Add a language switcher in the UI...")
- Internationalizing backend-generated content beyond Teacher Wang's meta-language (grammar feedback, system messages, emails, exports)
- Internationalizing PostgreSQL-stored content (HSK descriptions, and `frontend/src/data/chatCharacters.ts`, which is still deliberately untranslated — see the ADR's "Out of scope" section)
- Internationalizing S3-hosted static content (grammar lessons, onboarding guides)

If the user asks for one of these while running this skill, say so explicitly and point at the matching roadmap item rather than absorbing it into this workflow.

## Done criteria

- Every namespace under `frontend/src/locales/<lang>/` exists with the same keys as `en`, values translated
- `frontend/src/i18n.ts`'s `resources` includes the new language block
- `LANGUAGE_NAMES` in `behavior_spec.py` includes the code (if not already present), with a matching test case
- `npx vitest run --silent` and `python3 -m unittest discover -s backend/tests -q` both pass
- You previewed at least one page in the new language and saw no raw translation keys or unexpected English fallback text
- If the language is French, `README.md`'s roadmap box "Add French as the first additional language and validate the full localization workflow end-to-end" is checked
