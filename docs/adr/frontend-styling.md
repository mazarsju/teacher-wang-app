# Frontend CSS Organization

## Status

Accepted

## Context

The frontend used to keep every component's styles in one file, `frontend/src/App.css` (~3,500 lines), imported once by `App.tsx`. All class names were global strings. This caused two recurring problems:

* **Specificity workarounds instead of isolation.** Because every class lived in one global scope, unrelated rules collided. The fix in place was ancestor-prefix duplication — e.g. a button rule repeated as both `.foo-button {}` and `.page-content .foo-button {}` just to out-specify a generic reset — which is fragile and easy to get wrong when editing either rule in isolation.
* **Copy-pasted "design system" classes.** The handful of button looks (cancel / confirm / danger, in a modal / on a page / in a table / in a banner) were re-typed as literal `className="modal-button-cancel"`-style strings at ~90 call sites across ~25 files. Restyling one button kind meant hunting down every occurrence, and it was easy for one call site to drift from the others.

## Decision

### CSS layers

| Layer | Location | Contains |
| --- | --- | --- |
| Design tokens | `frontend/src/styles/tokens.css` | `:root` custom properties only (colors, fonts) |
| Reset / base | `frontend/src/styles/globals.css` | `*`, `body`, and base heading tag selectors — no classes |
| Cross-component design system | `frontend/src/components/shared.css` | Plain (non-module) global CSS for classes genuinely shared by many components: modal chrome (`.modal-overlay`, `.modal-dialog`, `.modal-title`, `.modal-field*`, `.modal-actions`, …), the toggle switch (`.toggle`, `.toggle-slider`), and the `Button` design system (`.btn`, `.btn-cancel`/`.btn-confirm`/`.btn-danger`, `.btn-page`/`.btn-modal`/`.btn-banner`/`.btn-table`/`.btn-confirmation`) |
| Component styles | `ComponentName.module.css`, co-located with `ComponentName.tsx` | Everything specific to one component/page |

`shared.css` is deliberately **not** a CSS Module. Its classes are meant to be referenced from many components without each one needing to import a JS binding, and other modules sometimes need to override a piece of it contextually (see below). Making it global keeps that possible; a `.module.css` file would hash its class names per-importer and break that.

`themes.css` is reserved (not yet created) for if/when the app gets a light/dark theme — add it next to `tokens.css` and `globals.css` when that lands, imported the same way.

### Cross-module references

A `.module.css` file that needs to combine its own scoped class with a `shared.css` (or another component's module) class wraps the shared side in `:global(...)`:

```css
/* Table.module.css */
.table-row:hover .table-row-actions :global(.btn) {
  opacity: 1;
}
```

```css
/* Banner.module.css — theme the shared confirm button for warning banners */
.app-banner--warning :global(.btn-confirm) {
  border-color: #d97706;
  color: #92400e;
}
```

This is the only sanctioned way to couple a component's CSS to `shared.css`; do not duplicate a shared rule locally to avoid the `:global()` wrapper.

### The `Button` component

`frontend/src/components/Button.tsx` is the only place a `<button>` should get the app's design-system look — **no other component should apply `.btn*`/`modal-button-*`/`page-add-button`-style classes directly to a raw `<button>`.**

```tsx
<Button kind="danger" variant="table" text="Delete" onClick={...} />
```

* `kind` (`"cancel" | "confirm" | "danger"`) — the color.
* `variant` (`"page" | "modal" | "banner" | "table" | "confirmation"`, default `"modal"`) — context sizing/backdrop. `"confirmation"` is the one variant that renders **filled/heavy** instead of outlined; it's reserved for the actual validation button of a yes/no `ConfirmModal`, so that one control stays visually distinct from every other (intentionally light) button in the app.
* `text`, `onClick`, `htmlType`, `disabled`, `icon`, `ariaLabel`, `title` — standard passthroughs.
* `className` — escape hatch for the rare one-off visual tweak (e.g. `HomePage`'s pill-shaped "Missing characters" badge) layered on top of the `kind`/`variant` classes rather than duplicating them.

Bespoke, non-repeated controls intentionally stay outside `Button` because forcing them in wouldn't reduce repetition and they don't fit the `kind`/`variant` shape: navbar tabs, `ProfileMenu`'s trigger and dropdown items, `HelpButton`'s bubble trigger, whole clickable cards (`ChatCharacterCard`, `ChallengeCard`), icon-only triggers (`home-hsk-info-button`, `ChatModal`'s close/severity-badge buttons), and `WelcomeAuthPage`'s branded submit/Google/switch buttons.

### Tooling

`vite.config.ts`:

* `css.modules.localsConvention: "camelCase"` — a `.module.css` class like `.foo-bar` is exported as **both** `foo-bar` and `fooBar`. Static references use `styles.fooBar`; dynamic ones (e.g. a per-severity or per-tone class built from a variable) use bracket access with the original kebab-case key, `` styles[`foo-bar--${x}`] ``.
* `test.css.include: [/\.module\.css$/]` + `test.css.modules.classNameStrategy: "non-scoped"` — by default Vitest auto-mocks CSS Module imports (every class resolves to its own JS property name), which would silently break `toHaveClass("foo-bar")`/`querySelector(".foo-bar")` assertions written against the old global classnames. This makes Vitest actually process `.module.css` files and keeps the resulting class names literal (unhashed) instead of scoped, so existing test assertions keep working unmodified.

## Rationale

* CSS Modules give each component a real local scope, removing the need for ancestor-prefix specificity hacks — a component's own rules simply can't leak into or be leaked into by another component's.
* `shared.css` as plain global CSS (rather than a module) is the pragmatic middle ground: it avoids forcing every consumer of a widely-shared class through a `:global()` wrapper just to use it, while `:global()` is still available for the less common case of a component needing to *theme* a shared class contextually.
* One `Button` component with a small `kind`×`variant` matrix replaces ~90 hand-typed `className` strings with a single source of truth for what each button kind looks like in each context — restyling one kind/variant pair now means editing one CSS rule instead of grepping the whole frontend.

## Consequences

### Advantages

* No more specificity workarounds; each component's CSS is self-contained.
* One place to change any button's look; new buttons default to a look that's already consistent with the rest of the app.
* Existing test assertions on literal class strings kept working through the whole migration — no test rewrites needed.

### Drawbacks

* There are now two flavors of "global" CSS (`styles/` for tokens/reset, `components/shared.css` for the shared design system) — a contributor adding a genuinely cross-component class needs to know it belongs in `shared.css`, not a new file under `styles/`.
* `:global()` cross-references are an easy pattern to reach for **too much**; a component-specific class should stay in that component's own `.module.css` even if it superficially resembles something in `shared.css`.
* `Button`'s `kind`/`variant` matrix intentionally doesn't cover every button in the app (see the bespoke-controls list above) — a future contributor adding a new button type needs to judge whether it's a `Button` variant or a genuinely one-off control, not force everything through `Button` reflexively.

## Future evolution

If the app grows a light/dark theme, add `frontend/src/styles/themes.css` next to `tokens.css` following the same import pattern in `App.tsx`. If a bespoke control listed above turns out to be needed in more than one place, that's the signal to fold it into `Button` (or a sibling design-system component) rather than copy-pasting it again.
