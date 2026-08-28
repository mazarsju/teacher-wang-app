# Agent entrypoint

Durable coding instructions live in **`.cursor/rules/`** (loaded by concern via globs; only documentation hygiene is always-on). Claude Code reads **`CLAUDE.md`** instead — a separate, hand-kept-in-sync copy of the same rules (`.mdc` files are terser mirrors of `CLAUDE.md`'s sections).

**Before ending any task that touched code, run the documentation checklist** in `CLAUDE.md` → "Documentation hygiene" (or `.cursor/rules/documentation.mdc`, the condensed mirror). It is a numbered checklist of "did X change? → update Y" questions covering README, ADRs, architecture docs, deployment docs, and the coding-convention rules themselves — run it every time, not just for large features.

| Need | Where |
| --- | --- |
| Human onboarding, commands, API catalog | [`README.md`](README.md) |
| Doc map (ADRs, architecture, Anki, deploy) | [`docs/README.md`](docs/README.md) |
| Architecture Decision Records | [`docs/adr/`](docs/adr/) |
| Reusable workflows (challenge, ECR, screenshots, …) | [`.cursor/skills/`](.cursor/skills/) |

Do not restate ADRs or deployment tables here — open the linked doc for that concern.

Markdown files: no artificial line breaks — write each paragraph and list item as a single line, and let the editor/viewer soft-wrap.
