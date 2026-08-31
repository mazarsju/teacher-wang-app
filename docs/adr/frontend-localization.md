# Frontend Localization Framework

## Status

Accepted

## Context

The frontend UI was English-only, with every user-facing string hardcoded directly in JSX (see [roadmap item 11](../../README.md#11-multi-language-management)). Adding another interface language meant editing every component by hand, with no structural boundary between "the app's logic" and "the app's copy."

This ADR covers the first two roadmap steps: adopting `react-i18next` and extracting existing UI text into translation resources organized by feature. Adding a second language and internationalizing backend-generated/database content are separate, later roadmap items. The language switcher UI and its persistence route are covered below (see "Language switcher").

## Decision

### Library

`i18next` + `react-i18next`. It's the de facto standard for React, supports namespaces (needed for the per-feature split below), ICU-free plural/interpolation out of the box, and a `<Trans>` component for strings with embedded markup (e.g. a link).

### Initialization

`frontend/src/i18n.ts` is the single init module. Translation resources are plain JSON, imported statically and passed to `i18next.init({ resources, ... })` with `initAsync: false`. i18next actually resolves synchronously whenever `resources` are supplied directly (no backend plugin), regardless of this flag — it's set explicitly so the intent survives a future refactor. Either way, there's no "loading translations" state, no suspense boundary, and `t()` works on the very first render (in the app and in tests). Adding a language later means adding a sibling `resources["fr"] = {...}` block; no component changes.

* App entry: imported once in `frontend/src/main.tsx` (`import "./i18n"`) before the tree renders.
* Tests: imported once in `frontend/src/test/setup.ts`, so every test gets a ready i18next instance with the real English strings — assertions like `getByText("Cancel")` keep working unmodified.

### Namespaces = feature areas

One JSON resource file per namespace, under `frontend/src/locales/en/<namespace>.json`:

| Namespace | Owns |
| --- | --- |
| `common` | App shell (`App.tsx`, `Navbar`, `ProfileMenu`, `HelpButton`), generic modals (`ConfirmModal`, `WarningModal`), the `Table` empty-state default, and any modal/component used from more than one feature area (e.g. `AddWordModal`, `ChatModal`, `ChallengeConfetti`, `KnowledgeBaseInitWizardModal`) |
| `home` | `HomePage`, `MissingHskCharactersModal` |
| `chat` | `ChatPage`, `ChatCharacterCard`, `ChatCharacterAvatar`, `ChallengeCard` |
| `challenge` | `frontend/src/data/challenges.ts`'s challenge catalog (`title`, `description`, `character.name`, `character.description`, `tasks[].label`) — a data namespace, not a component one; see the key-structure exception below |
| `knowledge-base` | `KnowledgeBasePage`, `AddSuggestedWordsModal`, `CharacterWordsModal`, `PinyinGridView` |
| `grammar` | `GrammarPage`, `GrammarPointDetailPage`, `GrammarExercises`, `GrammarVocabularyTab`, `GrammarMasteryModal` |
| `writing` | `WritingPracticeDetailPage`, `SentenceCorrectionModal`, `WritingReviewModal` |
| `preferences` | `PreferencesPage`, `ChangePlanModal`, `UpdatePlanModal`, and all Anki setup/sync modals (`AnkiConnectGuideModal`, `AnkiCustomFieldModal`, `AnkiDeckSetupModal`, `AnkiSyncHelpModal`, `AnkiSyncModal`, `VocabularyNoteTypeInfoModal`, `VocabularyThreeDirectionSetupModal`, `WritingDeckTypeInfoModal`) — grouped here because they're all reached from the Preferences page, not the Writing page |
| `admin` | `AdminPage` |
| `auth` | `WelcomeAuthPage` |

**Rule of thumb:** a component used from a single feature page keeps its strings in that feature's namespace. A component reachable from more than one feature (checked via a grep for its import) goes in `common` — this is what keeps a shared modal's copy from being duplicated (and drifting) across namespaces once translations exist.

### Key structure

Each namespace file is a flat map keyed by component name (camelCase), then by string purpose:

```json
{
  "homePage": {
    "loading": "Loading your progress...",
    "hskCard": {
      "title": "..."
    }
  },
  "missingHskCharactersModal": {
    "title": "..."
  }
}
```

Nesting under the owning component's name avoids collisions when a namespace holds several components' strings (e.g. `common`). Plurals use i18next's built-in `_one`/`_other` suffixes and `{{count}}`; interpolated values use `{{value}}`-style placeholders. Strings with embedded markup (a link, bold text) use `<Trans>` with numbered/child components rather than string concatenation, so the translated sentence can reorder around the markup.

**Exception — data catalogs:** `challenge.json` is keyed by a stable per-item slug (`restaurant`, `taxi`, …) instead of a component name, since it holds a list of translated *records* consumed by one function (`getChallenges(t)` in `challenges.ts`), not a single component's copy. `challenges.ts` keeps every non-translatable field (`id`, `chineseName`, `avatarVariant`, task `id`s, `hskLevel`) in a `_CHALLENGE_TEMPLATES` array alongside a `translationKey` per challenge and a `key` per task, and renders the translated fields (`title`, `description`, `character.name`, `character.description`, `tasks[].label`) through `t()` at call time — so the ids used for React keys, avatar lookups, and completion-progress tracking stay stable across languages. If another data catalog (not just component copy) needs localizing later, follow this same shape: a template array with stable ids/keys, a translation-key column pointing into a data-namespace JSON file, and a `get<Catalog>(t)` render function — rather than forcing it into the component-keyed convention above.

### Component usage

```tsx
const { t } = useTranslation("home");
// ...
<p>{t("homePage.loading")}</p>
```

Namespace is passed explicitly to `useTranslation()` at every call site rather than relying on a default, so a component's namespace is visible without checking the resource files.

### Language switcher

A `<select>` in `frontend/src/pages/PreferencesPage.tsx` lets the user change their interface language, restricted to `LANGUAGE_OPTIONS` (currently `["en", "fr"]` — the only codes with a translated resource bundle or in progress). Selecting a value calls `i18n.changeLanguage()` immediately (instant UI feedback) and `PATCH /preferences/language` (`backend/routes/language_preference.py`) to persist it; the route validates the code against `LANGUAGE_NAMES` (`backend/utils/aiChat/behavior_spec.py`, the same map used for Teacher Wang's meta-language prompts) and writes `users.language`. A failed request reverts `i18n.changeLanguage()` to the previous language and surfaces an error banner. `App.tsx` still applies `users.language` on login via `GET /auth/me`, so the two entry points (login, switcher) both funnel through `i18n.changeLanguage()`.

`LANGUAGE_OPTIONS` is a separate list from `LANGUAGE_NAMES` on purpose: `LANGUAGE_NAMES` back-fills ahead of full translation work (e.g. it already had `"fr"` before French `locales/fr/*.json` existed), while `LANGUAGE_OPTIONS` should only list codes a user can actually get a translated (or acceptably English-fallback) UI in.

## Rationale

* Feature-scoped namespaces mirror how the codebase is already split (pages, and modals grouped by the page that opens them), so a contributor adding a string already knows which file to edit.
* Fully synchronous init avoids a loading/suspense state that would otherwise need to be threaded through `main.tsx`, every test render, and any component that calls `t()` before the app has hydrated.
* Keying by component name inside each namespace file keeps the namespace boundary about *where a string is used*, not a second guess about which feature "owns" a shared modal — that judgment call is made once, explicitly, in the table above.

## Consequences

### Advantages

* No component hardcodes UI copy anymore; every string change is a JSON edit.
* Adding a language is additive (a new `resources["<lng>"]` block per namespace) — no JSX changes.
* Existing tests assert on the same English strings, now resolved through `t()`, so the migration required no test rewrites.

### Drawbacks

* A component's namespace assignment (`common` vs. its feature) is a judgment call made at extraction time, not enforced by tooling — a new modal reused from a second feature later needs a manual move to `common` (and its key renamed to avoid clashing with existing `common` entries).
* Nine growing JSON files instead of one is more files to keep in sync when adding a second language; there is no automated check yet that a key present in `en` is present in every other language.

## Out of scope

* **Content data, not UI chrome — partially deferred.** The original extraction pass left `frontend/src/data/challenges.ts` and `frontend/src/data/chatCharacters.ts` untranslated on purpose, since the roadmap's next step ("Internationalize application data stored in PostgreSQL") explicitly calls out "challenge metadata" as content moving into the database. `challenges.ts` was translated in a follow-up pass anyway (into the `challenge` namespace, see above) on explicit request, accepting that this JSON will likely be thrown away once that migration lands — see the Postgres note under Future evolution. `frontend/src/data/chatCharacters.ts`'s `description` field was translated on explicit, scoped request, following `challenges.ts`'s template-array/`get<Catalog>(t)` pattern (`getTeacherWang`/`getXiaoMing`/`getChatCharacters` reading `locales/en/chat.json`'s `chatCharacters` key). Unlike `challenges.ts`, `name` stays a hardcoded English proper noun here (only `description` was in scope) — `chineseName`/`avatarVariant` stay hardcoded too, same as `challenges.ts`. `frontend/src/types/anki.ts`'s `ANKI_DECK_LABELS`/`ANKI_DECK_DESCRIPTIONS` were also converted (into `preferences.json`'s `ankiDeckKind` key), because that data has no plan to move to Postgres — it's permanent frontend-only UI copy, just factored into a shared constant instead of being repeated at each of its three call sites.
* Non-UI strings — AI prompt/instruction text built for the chat backend (e.g. in `GrammarExercises.tsx`'s `buildExplanationRequest`/`buildAnswerCheckRequest` helpers) — were left as English literals since they instruct the LLM, not the user; that's backend-generated-content internationalization (a separate, later roadmap item), not frontend UI text.

## Future evolution

* Finishing French: create `frontend/src/locales/fr/<namespace>.json` mirroring the `en` key structure and add it to `resources` in `frontend/src/i18n.ts` (`fr` is already selectable in the Preferences switcher — see "Language switcher" above — but falls back to English string-by-string via `fallbackLng` until this lands). The `.claude/skills/add-language/` skill automates this and the parallel switcher/`LANGUAGE_NAMES` registration steps for any future language.
* If missing-key drift across languages becomes a real problem, add a CI check (e.g. a script diffing key sets between `locales/en/*.json` and every other language directory) rather than relying on manual review.
* When challenge/character content moves into Postgres, its translated copy should live wherever that roadmap item lands it (likely DB rows keyed by language) — at that point `locales/en/challenge.json` and `challenges.ts`'s template array become redundant and should be deleted rather than kept as a second, drifting source of the same content.
