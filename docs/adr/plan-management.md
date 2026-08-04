# Plan Management Architecture

## Status

Draft / partially accepted

The free-plan token budget is implemented. Payment, paid-plan entitlements, and upgrade UX remain open (README roadmap §8).

Related: [auth](./auth.md) (who the user is), [data isolation](./data-isolation.md) (`users.plan`, private `settings` / `token_count`).

## Context

LLM chat (character reply, grammar teacher, challenge judge) costs real money. Every authenticated user starts on a **free** plan. We need a simple, enforceable budget so free usage cannot grow without bound, while leaving room for a future **paid** tier that is not capped the same way.

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
| **A. Soft quota in `settings.available_token` + `users.plan`** | Cap remaining tokens for `plan == free`; deduct after each LLM call; paid skips gate | **Chosen (v1)** |
| **B. Hard feature lock** | Disable chat entirely on free | Deferred — free users get a finite allowance instead |
| **C. New `user_quotas` table** | Dedicated columns for max / remaining / period | Rejected for v1 (settings key/value is enough; seed on login) |
| **D. Enforce only in the SPA** | Hide chat when exhausted | Rejected — must be server-side |

## Decision (v1)

### Plan identity

* `users.plan` is a string. Default / free value: `"free"` (`DEFAULT_USER_PLAN` in `backend/models.py`).
* Any other value is treated as **paid** for token gating today (no enumerated paid product SKUs yet).
* Exposed on `GET /auth/me` and on `GET /token-usage` as `plan`.

### Free-plan token budget

| Concern | Choice |
| --- | --- |
| Remaining budget | Per-user setting key `available_token` (`SETTING_AVAILABLE_TOKEN`) |
| Initial allowance | `FREE_PLAN_MAX_ALLOWED_TOKEN = 100_000`, seeded in `DEFAULT_SETTINGS` |
| Seed timing | `ensure_default_settings(user_id)` on **new and returning** users (inserts missing keys only) — no Alembic data migration |
| Gate | Before every LLM call in `_invoke_llm` (`backend/chat_service.py`): if `plan == free` and `available_token <= 0` → `ValueError` with a user-facing message |
| Deduct | After a successful invoke, subtract `input + output` tokens from `available_token` (may go **negative** so one large call can overshoot; the next call is blocked) |
| Paid | Skip check and deduct |

User-facing exhaustion message (also returned as `{"error": "..."}` with HTTP 400 from chat routes):

> Sorry, you've used up the tokens included with your free plan. If you're enjoying chat, consider upgrading to a paid account!

### Accounting vs budget

Two complementary numbers:

| Store | Role |
| --- | --- |
| `token_count` | Append-only usage history (input/output events, price cents) for charts and bookkeeping |
| `settings.available_token` | Mutable **remaining** free-plan budget |

`GET /token-usage` returns both views:

| Field | Meaning |
| --- | --- |
| `total_tokens` / `days` / `total_cost_usd` | Historical usage (cost may stay for backend bookkeeping; Preferences UI does not show $) |
| `available_token` | Remaining budget from settings |
| `max_allowed_token` | `100000` when `plan == free`, else `null` |
| `plan` | From `users.plan` |

### Frontend

* Preferences shows a **Remaining tokens** progress bar when `max_allowed_token` is set (clamped display `0…max`).
* Chat surfaces the API error string as-is (no special-case copy in the client).
* Upgrade / checkout UI is out of scope until a payment provider is chosen.

### Interaction overview

```text
POST /chat (or any path that calls _invoke_llm)
        │
        ▼
  current_user() → users.plan
        │
        ├─ free & available_token <= 0 ──► 400 + exhaustion message
        │
        └─ else
              get_llm().invoke(...)
              record token_count (usage history)
              if free: available_token -= used
```

## Out of scope (remaining)

* Payment subscription (upgrade / renew / cancel) and webhook → `users.plan` updates.
* Resetting or topping up `available_token` on paid → free transitions, billing periods, or promo codes.
* Per-model or per-feature quotas; rate limits beyond the lifetime free budget.
* Soft warnings in the UI before the budget hits zero.
* Locking non-LLM features by plan.

## Consequences

### Advantages

* No schema migration: settings key/value + existing `users.plan`.
* Enforcement sits on the single LLM entry point, so grammar checks, challenge replies, and judges share the same budget.
* Returning free users pick up `available_token` automatically on next authenticated request.
* Preferences can show remaining vs max without a second endpoint.

### Drawbacks / follow-ups

* Lifetime free budget (not monthly) until product defines a reset policy.
* Overshoot can leave `available_token` slightly negative; display clamps to zero.
* Paid is currently “any plan ≠ free” with no product catalog — refine when billing lands.
* Concurrent LLM calls could race on the settings row; acceptable at current scale; revisit if needed.
* Operators must not expose LLM keys via API; plan limits control **usage**, not model access (see README LLM configuration).

## Open questions for a future revision

1. Which payment provider and how `plan` values are named (`paid`, `pro`, SKU ids)?
2. Does paid get unlimited tokens, a higher cap, or a metered bill?
3. Should free allowance reset monthly, or only increase via upgrade / admin grant?
4. Do we ever refill `available_token` when upgrading mid-exhaustion?
