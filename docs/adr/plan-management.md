# Plan Management Architecture

## Status

Draft / partially accepted

The token budget is implemented for every plan (free and pro both capped, pro at a higher grant). Payment, paid-plan entitlements beyond the token cap, and upgrade UX remain open (README roadmap §8).

Related: [auth](./auth.md) (who the user is), [data isolation](./data-isolation.md) (`users.plan`, private `settings` / `token_count`).

## Context

LLM chat (character reply, grammar teacher, challenge judge, background conversation-memory summarization) costs real money. Every authenticated user starts on a **free** plan. We need a simple, enforceable budget so free usage cannot grow without bound, while leaving room for a future **paid** tier that is not capped the same way.

Constraints:

| Topic | Answer |
| --- | --- |
| Tenancy | 1 Cognito user = 1 `users` row; plan is per user |
| Billing today | None — no Stripe / App Store / Cognito billing yet |
| Where to store remaining budget | Prefer existing private tables; avoid a schema migration for the first cut |
| Enforcement point | Must cover **every** LLM invoke, not only `POST /chat` |

## Options considered

| Option | What it is | Outcome |
| --- | --- |
| **A. Soft quota in `settings.available_token` + `users.plan`** | Cap remaining tokens for every plan (free at a lower grant, pro at a higher one); deduct after each LLM call | **Chosen (v1)** |
| **B. Hard feature lock** | Disable chat entirely on free | Deferred — free users get a finite allowance instead |
| **C. New `user_quotas` table** | Dedicated columns for max / remaining / period | Rejected for v1 (settings key/value is enough; seed on login) |
| **D. Enforce only in the SPA** | Hide chat when exhausted | Rejected — must be server-side |

## Decision (v1)

### Plan identity

* `users.plan` is a string. Default / free value: `"free"` (`DEFAULT_USER_PLAN` in `backend/utils/database/models.py`).
* Any other value is treated as **paid** for token gating today (no enumerated paid product SKUs yet).
* Exposed on `GET /auth/me` and on `GET /token-usage` as `plan`.

### Token budget (every plan)

| Concern | Choice |
| --- | --- |
| Remaining budget | Per-user setting key `available_token` (`SETTING_AVAILABLE_TOKEN`) |
| Initial allowance | `FREE_PLAN_MAX_ALLOWED_TOKEN = 100_000` for `plan == free`, `PRO_PLAN_TOKEN_GRANT = 10_000_000` otherwise — both seeded/refilled by `reset_available_token(user_id, plan)`, which is called from `ensure_default_settings` (new/returning users) and monthly (`_reset_monthly_tokens` in `backend/utils/auth/user_context.py`, on the first authenticated request of a new calendar month) |
| Gate | Before every LLM call in `_invoke_llm` (`backend/utils/aiChat/chat_service.py`): `assert_plan_has_tokens(user)` (`backend/utils/database/settings.py`) raises if `available_token <= 0`, for **every** plan — only the hardcoded admin account is exempt. `POST /chat/tts` and `POST /chat/stt` (`backend/routes/chat.py`) call the same function directly (not through `_invoke_llm`, since they don't go through the chat LLM) before calling OpenAI |
| Deduct | After a successful invoke, subtract `input + output` tokens from `available_token` for every plan (may go **negative** so one large call can overshoot; the next call is blocked until the next monthly reset — no attempt is made to estimate a call's cost ahead of time to pre-empt this, by design, see [voice-interaction.md](./voice-interaction.md) open question 1). TTS/STT deduct through the same `deduct_available_token`, via a small `_charge_token_usage` helper in `backend/routes/chat.py` — since neither OpenAI call returns real token usage, the count is `estimate_text_tokens()` (a `tiktoken` `cl100k_base` count of the TTS input text or the STT output transcript), and `record_token_usage` prices it at the configured chat model's rate rather than tts-1/whisper-1's real per-character/per-minute billing (see [voice-interaction.md](./voice-interaction.md)) |
| No request context | `_invoke_llm` normally resolves the caller via `current_user()`, which needs a Flask request context. A caller without one (a background thread) can't use that — it now accepts an explicit `user=` argument instead. `_summarize_and_store` (`backend/utils/aiChat/conversation_summary.py`, the background job queued after a chat turn to update the learner's conversation memory) resolves its own `User` row from the `user_id` it already has and passes it in, so this LLM call is gated/charged like any other. Weekly article generation (a true batch job, not billed to one learner) still calls `_invoke_llm` with no `user` at all, which is treated as ungated by design — see Consequences |
| Admin | The hardcoded admin account (`ADMIN_EMAIL`) skips the gate entirely, regardless of plan — see `assert_plan_has_tokens` |

User-facing exhaustion message (also returned as `{"error": "..."}` with HTTP 400 from chat routes) — plan-specific, since "upgrade to a paid account" makes no sense once a pro account is the one exhausted:

> Free plan: Sorry, you've used up the tokens included with your free plan. If you're enjoying chat, consider upgrading to a paid account!
>
> Pro plan: Sorry, you've used up your plan's token allowance for now. It will refill at the start of next month.

### Accounting vs budget

Two complementary numbers:

| Store | Role |
| --- | --- |
| `token_count` | Append-only usage history (input/output events, price cents) for charts and bookkeeping |
| `settings.available_token` | Mutable **remaining** budget, for whichever plan the user is on |

`GET /token-usage` returns both views:

| Field | Meaning |
| --- | --- |
| `total_tokens` / `days` / `total_cost_usd` | Historical usage (cost may stay for backend bookkeeping; Preferences UI does not show $) |
| `available_token` | Remaining budget from settings |
| `max_allowed_token` | `FREE_PLAN_MAX_ALLOWED_TOKEN` (100000) when `plan == free`, else `PRO_PLAN_TOKEN_GRANT` (10000000) |
| `plan` | From `users.plan` |

### Frontend

* Preferences shows a **Remaining tokens** progress bar when `max_allowed_token` is set (clamped display `0…max` — always set today, for both plans), plus a "Current plan" section with a Free/Pro feature-comparison modal (`ChangePlanModal`). Picking Pro opens `UpdatePlanModal`, which is still the same non-functional placeholder (no payment provider wired up).
* Chat surfaces the API error string as-is (no special-case copy in the client) — the string itself is plan-appropriate (see the two exhaustion messages above).
* Upgrade / checkout UI is out of scope until a payment provider is chosen.

### Interaction overview

```text
POST /chat (or any path that calls _invoke_llm)
        │
        ▼
  current_user() (or an explicit user= for a background caller) → users.plan
        │
        ├─ admin ──────────────────────────► skip gate entirely
        ├─ available_token <= 0 (any plan) ─► 400 + plan-appropriate exhaustion message
        │
        └─ else
              get_llm().invoke(...)
              record token_count (usage history)
              available_token -= used
```

The background conversation-summarization thread runs the same shape, just with `user` resolved from `user_id` instead of `current_user()` (no Flask request context there): see [voice-interaction.md](./voice-interaction.md) for `POST /chat/tts`/`POST /chat/stt`, which aren't `_invoke_llm` calls at all (no langchain `messages` list) but gate/charge the same budget directly.

## Out of scope (remaining)

* Payment subscription (upgrade / renew / cancel) and webhook → `users.plan` updates.
* Refilling `available_token` when upgrading mid-exhaustion (the learner waits for the next monthly reset, same as anyone else).
* Per-model or per-feature quotas; rate limits beyond the monthly per-plan budget.
* Soft warnings in the UI before the budget hits zero.
* Locking non-LLM features by plan.

## Consequences

### Advantages

* No schema migration: settings key/value + existing `users.plan`.
* Enforcement sits on the single LLM entry point, so grammar checks, challenge replies, judges, and background conversation-memory summarization all share the same budget.
* Weekly article generation (a system-wide batch job with no single owning learner) deliberately bypasses this gate — `_invoke_llm` with no resolvable `user` skips the check entirely. That exemption exists only because no individual learner is being billed for it; a new per-user feature must never rely on the same "no user" path to skip gating (see `.cursor/rules/llm-token-quota.mdc`).
* Returning users pick up their plan's `available_token` automatically on next authenticated request, and it refills at the start of each calendar month (`_reset_monthly_tokens`) — no separate reset job.
* Preferences can show remaining vs max without a second endpoint.
* Pro is capped too (at a 100× higher grant than free), closing the gap where a compromised or runaway pro client could generate unbounded LLM/TTS/STT spend — see [voice-interaction.md](./voice-interaction.md).

### Drawbacks / follow-ups

* Overshoot can leave `available_token` slightly negative; display clamps to zero. No estimate-ahead-of-call is attempted for any plan, by design — the gate only checks whether the budget is already at or below zero, not whether the upcoming call would overshoot it (see [voice-interaction.md](./voice-interaction.md) open question 1).
* Paid is currently “any plan ≠ free” with no product catalog — refine when billing lands.
* Concurrent LLM calls could race on the settings row; acceptable at current scale; revisit if needed.
* Operators must not expose LLM keys via API; plan limits control **usage**, not model access (see README LLM configuration).
* `/chat/tts`/`/chat/stt` token counts are a text-length estimate (`estimate_text_tokens`), not real OpenAI usage — accurate enough to gate/deduct the budget, but the `token_count` price for these events is computed at the chat model's per-token rate, not tts-1/whisper-1's real pricing (see [voice-interaction.md](./voice-interaction.md)).

## Open questions for a future revision

1. Which payment provider and how `plan` values are named (`paid`, `pro`, SKU ids)?
2. ~~Does paid get unlimited tokens, a higher cap, or a metered bill?~~ **Resolved:** a higher cap (`PRO_PLAN_TOKEN_GRANT`), gated/charged the same way as free — see Decision above.
3. Do we ever refill `available_token` when upgrading mid-exhaustion, rather than making the learner wait for the next monthly reset?
