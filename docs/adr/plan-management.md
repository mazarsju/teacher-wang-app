# Plan Management Architecture

## Status

Draft / partially accepted

The free-plan token budget is implemented. Payment, paid-plan entitlements, and upgrade UX remain open (README roadmap §8).

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
| **A. Soft quota in `settings.available_token` + `users.plan`** | Cap remaining tokens for `plan == free`; deduct after each LLM call; paid skips gate | **Chosen (v1)** |
| **B. Hard feature lock** | Disable chat entirely on free | Deferred — free users get a finite allowance instead |
| **C. New `user_quotas` table** | Dedicated columns for max / remaining / period | Rejected for v1 (settings key/value is enough; seed on login) |
| **D. Enforce only in the SPA** | Hide chat when exhausted | Rejected — must be server-side |

## Decision (v1)

### Plan identity

* `users.plan` is a string. Default / free value: `"free"` (`DEFAULT_USER_PLAN` in `backend/utils/database/models.py`).
* Any other value is treated as **paid** for token gating today (no enumerated paid product SKUs yet).
* Exposed on `GET /auth/me` and on `GET /token-usage` as `plan`.

### Free-plan token budget

| Concern | Choice |
| --- | --- |
| Remaining budget | Per-user setting key `available_token` (`SETTING_AVAILABLE_TOKEN`) |
| Initial allowance | `FREE_PLAN_MAX_ALLOWED_TOKEN = 100_000`, seeded in `DEFAULT_SETTINGS` |
| Seed timing | `ensure_default_settings(user_id)` on **new and returning** users (inserts missing keys only) — no Alembic data migration |
| Gate | Before every LLM call in `_invoke_llm` (`backend/utils/aiChat/chat_service.py`): if `plan == free` and `available_token <= 0` → `ValueError` with a user-facing message. `POST /chat/tts` and `POST /chat/stt` (`backend/routes/chat.py`) call the same `assert_free_plan_has_tokens` directly (not through `_invoke_llm`, since they don't go through the chat LLM) before calling OpenAI |
| Deduct | After a successful invoke, subtract `input + output` tokens from `available_token` (may go **negative** so one large call can overshoot; the next call is blocked). TTS/STT deduct through the same `deduct_available_token`, via a small `_charge_token_usage` helper in `backend/routes/chat.py` — since neither OpenAI call returns real token usage, the count is `estimate_text_tokens()` (a `tiktoken` `cl100k_base` count of the TTS input text or the STT output transcript), and `record_token_usage` prices it at the configured chat model's rate rather than tts-1/whisper-1's real per-character/per-minute billing (see [voice-interaction.md](./voice-interaction.md)) |
| No request context | `_invoke_llm` normally resolves the caller via `current_user()`, which needs a Flask request context. A caller without one (a background thread) can't use that — it now accepts an explicit `user=` argument instead. `_summarize_and_store` (`backend/utils/aiChat/conversation_summary.py`, the background job queued after a chat turn to update the learner's conversation memory) resolves its own `User` row from the `user_id` it already has and passes it in, so this LLM call is gated/charged like any other. Weekly article generation (a true batch job, not billed to one learner) still calls `_invoke_llm` with no `user` at all, which is treated as ungated by design — see Consequences |
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

* Preferences shows a **Remaining tokens** progress bar when `max_allowed_token` is set (clamped display `0…max`), plus a "Current plan" section with a Free/Pro feature-comparison modal (`ChangePlanModal`). Picking Pro opens `UpdatePlanModal`, which is still the same non-functional placeholder (no payment provider wired up).
* Chat surfaces the API error string as-is (no special-case copy in the client).
* Upgrade / checkout UI is out of scope until a payment provider is chosen.

### Interaction overview

```text
POST /chat (or any path that calls _invoke_llm)
        │
        ▼
  current_user() (or an explicit user= for a background caller) → users.plan
        │
        ├─ free & available_token <= 0 ──► 400 + exhaustion message
        │
        └─ else
              get_llm().invoke(...)
              record token_count (usage history)
              if free: available_token -= used
```

The background conversation-summarization thread runs the same shape, just with `user` resolved from `user_id` instead of `current_user()` (no Flask request context there): see [voice-interaction.md](./voice-interaction.md) for `POST /chat/tts`/`POST /chat/stt`, which aren't `_invoke_llm` calls at all (no langchain `messages` list) but gate/charge the same budget directly.

## Out of scope (remaining)

* Payment subscription (upgrade / renew / cancel) and webhook → `users.plan` updates.
* Resetting or topping up `available_token` on paid → free transitions, billing periods, or promo codes.
* Per-model or per-feature quotas; rate limits beyond the lifetime free budget.
* Soft warnings in the UI before the budget hits zero.
* Locking non-LLM features by plan.

## Consequences

### Advantages

* No schema migration: settings key/value + existing `users.plan`.
* Enforcement sits on the single LLM entry point, so grammar checks, challenge replies, judges, and background conversation-memory summarization all share the same budget.
* Weekly article generation (a system-wide batch job with no single owning learner) deliberately bypasses this gate — `_invoke_llm` with no resolvable `user` skips the check entirely. That exemption exists only because no individual learner is being billed for it; a new per-user feature must never rely on the same "no user" path to skip gating (see `.cursor/rules/llm-token-quota.mdc`).
* Returning free users pick up `available_token` automatically on next authenticated request.
* Preferences can show remaining vs max without a second endpoint.

### Drawbacks / follow-ups

* Lifetime free budget (not monthly) until product defines a reset policy.
* Overshoot can leave `available_token` slightly negative; display clamps to zero.
* Paid is currently “any plan ≠ free” with no product catalog — refine when billing lands.
* Concurrent LLM calls could race on the settings row; acceptable at current scale; revisit if needed.
* Operators must not expose LLM keys via API; plan limits control **usage**, not model access (see README LLM configuration).
* `/chat/tts`/`/chat/stt` token counts are a text-length estimate (`estimate_text_tokens`), not real OpenAI usage — accurate enough to gate/deduct the budget, but the `token_count` price for these events is computed at the chat model's per-token rate, not tts-1/whisper-1's real pricing (see [voice-interaction.md](./voice-interaction.md)).

## Open questions for a future revision

1. Which payment provider and how `plan` values are named (`paid`, `pro`, SKU ids)?
2. Does paid get unlimited tokens, a higher cap, or a metered bill?
3. Should free allowance reset monthly, or only increase via upgrade / admin grant?
4. Do we ever refill `available_token` when upgrading mid-exhaustion?
