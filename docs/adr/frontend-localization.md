# Frontend Localization Framework

## Status

Accepted

## Context

The frontend UI was English-only, with every user-facing string hardcoded directly in JSX (see [roadmap item 11](../../README.md#11-multi-language-management)). Adding another interface language meant editing every component by hand, with no structural boundary between "the app's logic" and "the app's copy."

This ADR covers the first two roadmap steps: adopting `react-i18next` and extracting existing UI text into translation resources organized by feature. Adding a second language, a language switcher, and internationalizing backend-generated/database content are separate, later roadmap items.

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

### Component usage

```tsx
const { t } = useTranslation("home");
// ...
<p>{t("homePage.loading")}</p>
```

Namespace is passed explicitly to `useTranslation()` at every call site rather than relying on a default, so a component's namespace is visible without checking the resource files.

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

* **Content data, not UI chrome.** `frontend/src/data/challenges.ts` and `frontend/src/data/chatCharacters.ts` hold the challenge/character catalog (titles, descriptions, task labels, names) as hardcoded English TypeScript constants rendered directly by `ChatPage`/`ChallengeCard`/`ChatModal`/etc. This extraction pass left them untranslated on purpose: the roadmap's next step ("Internationalize application data stored in PostgreSQL") explicitly calls out "challenge metadata" as content that's moving into the database, not staying in a frontend TS file — translating it here would be thrown away once that migration lands. `frontend/src/types/anki.ts`'s `ANKI_DECK_LABELS`/`ANKI_DECK_DESCRIPTIONS` were the one exception converted in this pass (extracted into `preferences.json`'s `ankiDeckKind` key), because that data has no plan to move to Postgres — it's permanent frontend-only UI copy, just factored into a shared constant instead of being repeated at each of its three call sites.
* Non-UI strings — AI prompt/instruction text built for the chat backend (e.g. in `GrammarExercises.tsx`'s `buildExplanationRequest`/`buildAnswerCheckRequest` helpers) — were left as English literals since they instruct the LLM, not the user; that's backend-generated-content internationalization (a separate, later roadmap item), not frontend UI text.

## Future evolution

* Adding French: create `frontend/src/locales/fr/<namespace>.json` mirroring the `en` key structure, add it to `resources` in `frontend/src/i18n.ts`, and (roadmap item) add a language switcher that calls `i18n.changeLanguage()` and persists the choice.
* If missing-key drift across languages becomes a real problem, add a CI check (e.g. a script diffing key sets between `locales/en/*.json` and every other language directory) rather than relying on manual review.
* When challenge/character content moves into Postgres, its translated copy should live wherever that roadmap item lands it (likely DB rows keyed by language), not back in a frontend JSON namespace.
