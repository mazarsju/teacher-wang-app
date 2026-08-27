# Agent entrypoint

Durable coding instructions live in **`.cursor/rules/`** (loaded by concern via globs; only documentation hygiene is always-on).

| Need | Where |
| --- | --- |
| Human onboarding, commands, API catalog | [`README.md`](README.md) |
| Doc map (ADRs, architecture, Anki, deploy) | [`docs/README.md`](docs/README.md) |
| Architecture Decision Records | [`docs/adr/`](docs/adr/) |
| Reusable workflows (challenge, ECR, screenshots, …) | [`.cursor/skills/`](.cursor/skills/) |

Do not restate ADRs or deployment tables here — open the linked doc for that concern.

Markdown files: no artificial line breaks — write each paragraph and list item as a single line, and let the editor/viewer soft-wrap.
