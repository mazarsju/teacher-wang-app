# Documentation map

Use this index to find the right document. Prefer **one source of truth** and link elsewhere.

## Where information belongs

| Kind | Location | Put here |
| --- | --- | --- |
| Durable coding instructions | `.cursor/rules/*.mdc` | Conventions and invariants that must influence code generation |
| Reusable workflows | `.cursor/skills/*/SKILL.md` | Procedural multi-step tasks (create challenge, push ECR, …) |
| Architecture Decision Records | `docs/adr/` | Why a decision was made (context, options, consequences) |
| Architecture reference | `docs/architecture/` | Schema catalogs, storage layouts (not “why”) |
| Deployment reference | `docs/deployment/` | ECS/Docker facts for operators and agents |
| Anki protocol / setup | `docs/anki/` | Sync steps, AnkiConnect setup screenshots |
| Human onboarding | `README.md` | Getting started, API catalog, features, roadmap |
| Agent entrypoint | `AGENTS.md` | Short pointer to rules + this map |

## Architecture Decision Records

| Concern | ADR |
| --- | --- |
| AnkiConnect bridge | [adr/anki-connect.md](adr/anki-connect.md) |
| Anki ↔ KB sync orchestration | [adr/anki-sync.md](adr/anki-sync.md) |
| Multi-agent chat | [adr/ai-agents.md](adr/ai-agents.md) |
| Weekly articles generation | [adr/weekly-articles.md](adr/weekly-articles.md) |
| PostgreSQL | [adr/postgres.md](adr/postgres.md) |
| Authentication (Cognito) | [adr/auth.md](adr/auth.md) |
| Data isolation / tenancy | [adr/data-isolation.md](adr/data-isolation.md) |
| Plan / token budget | [adr/plan-management.md](adr/plan-management.md) |
| Frontend CSS organization | [adr/frontend-styling.md](adr/frontend-styling.md) |
| Grammar content (lessons, exercises, mastery) | [adr/grammar-content.md](adr/grammar-content.md) |
| Writing practice | [adr/writing-practice.md](adr/writing-practice.md) |

Obsolete decisions: [adr/archived/](adr/archived/) (history only).

### Archiving obsolete decisions

When an ADR **no longer describes the current implementation**:

1. **Do not delete** the file.
2. **Move** it to `docs/adr/archived/` (keep a clear filename).
3. **Prepend** an archival header with invalid-from date, why, and follow-up link.
4. Update this map and `README.md` so active lists no longer treat it as current.

Example header:

```markdown
> **Archived — no longer current**
>
> | | |
> | --- | --- |
> | **Invalid from** | YYYY-MM-DD |
> | **Why** | Brief reason. |
> | **Follow-up** | [Related ADR](../other.md) |
>
> ---
```

## By retrieval concern

| Question about… | Read |
| --- | --- |
| Cognito / JWT / login | [adr/auth.md](adr/auth.md) |
| `user_id` / partitions / private tables | [adr/data-isolation.md](adr/data-isolation.md), [architecture/schema-tenancy.md](architecture/schema-tenancy.md) |
| Conversation log paths | [architecture/conversation-logs.md](architecture/conversation-logs.md) |
| Alembic / Postgres engine | [adr/postgres.md](adr/postgres.md), README Database |
| AnkiConnect ownership | [adr/anki-connect.md](adr/anki-connect.md) |
| Push/pull sync steps | [anki/sync-protocol.md](anki/sync-protocol.md) |
| Chat agents / challenges | [adr/ai-agents.md](adr/ai-agents.md), skill `create-challenge` |
| Weekly articles / `POST /admin/articles/generate` / `python3 -m backend.jobs.generate_weekly_articles` / `weekly_articles` | [adr/weekly-articles.md](adr/weekly-articles.md) |
| Teacher Wang teaching behaviors (for planner/generator/validator) | [architecture/teacher-wang-behaviors.md](architecture/teacher-wang-behaviors.md) |
| Teacher Wang teaching strategy (HSK-level adaptation) | [architecture/teacher-wang-teaching-strategy.md](architecture/teacher-wang-teaching-strategy.md) |
| Free-plan tokens | [adr/plan-management.md](adr/plan-management.md) |
| Component CSS / `Button` design system | [adr/frontend-styling.md](adr/frontend-styling.md) |
| Grammar lessons / exercises / mastery | [adr/grammar-content.md](adr/grammar-content.md) |
| Writing topics / drafts / sentence correction / `writing_progress` | [adr/writing-practice.md](adr/writing-practice.md) |
| ECS ports / `/api` proxy / ECR | [deployment/ecs-containers.md](deployment/ecs-containers.md) |
| Product screenshots | [screenshots/](screenshots/) |
| AnkiConnect install UI | [anki/setup/](anki/setup/) |
