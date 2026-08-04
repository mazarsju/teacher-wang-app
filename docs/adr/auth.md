# Authentication & Credentials Architecture

## Status

Accepted

Aligned with Decision 1 in [teacher-wang-infra multi-user architecture](https://github.com/mazarsju/teacher-wang-infra/blob/main/docs/multi-user-archi-decision.md). Per-user data isolation is covered separately in [data-isolation ADR](./data-isolation.md). Coding invariants: `.cursor/rules/multi-tenant.mdc`, `.cursor/rules/frontend-api.mdc`.

## Context

Teacher Wang is a Flask API plus React UI deployed on AWS (ECS containers, RDS PostgreSQL via [teacher-wang-infra](https://github.com/mazarsju/teacher-wang-infra)). Authentication is implemented with Amazon Cognito; APIs (except `OPTIONS` and `/health`) require a verified Bearer JWT, and private learner data is scoped by Cognito `sub` (see [data isolation](./data-isolation.md)).

Product needs:

* **Log in (default):** username + password; **Google SSO** on the same identity path.
* **Sign up:** username + email + password. Username and email must be unique per user.
* Tenancy grain: **1 user = 1 data owner** (no families / classes / orgs for now).

Credentials must not live as reversible secrets in application tables. Infra and app agree on Cognito for identity; this document records the **app-side** credential decision and API contract.

## Options considered

| Option | What it is | Outcome |
| --- | --- | --- |
| **A. Amazon Cognito User Pools** | Managed directory; username/email/password; Google social IdP; JWT/OIDC for Flask | **Chosen** |
| **B. App-owned auth in Postgres** + Google OAuth in the backend | Hash passwords, reset, sessions, Google verify yourself | Rejected (security + feature debt) |
| **C. Auth0 / Clerk / similar SaaS** | Polished UX outside AWS | Rejected (extra vendor / MAU cost) |
| **D. Self-hosted Keycloak / SuperTokens** on ECS | Full control, always-on ops | Rejected (overkill for cost posture) |

## Decision

**Use an Amazon Cognito User Pool for credentials. Never store password hashes (or plaintext passwords) in Postgres.**

| Concern | Where it lives |
| --- | --- |
| Username, email, password (hashed by Cognito), Google SSO | **Cognito User Pool** |
| Stable subject + profile fields the app needs (display name, email for UX) | **Postgres** thin `users` / `profiles` row keyed by Cognito `sub` |
| Private learner data and shared catalogs | See [data isolation](./data-isolation.md) |

### Identity (Cognito)

* Sign-up collects **username**, **email**, and **password**. Cognito enforces uniqueness for username (and email as configured).
* Log-in uses **username + password** against the User Pool.
* **Google SSO** uses the Cognito **Hosted UI** authorize endpoint with `identity_provider=Google` (authorization code + PKCE). The SPA redirects to Cognito, Google signs the user in, Cognito returns to the app origin with a `code`, and the client exchanges it at `/oauth2/token` (`frontend/src/utils/auth/cognitoOAuth.ts`). The welcome screen exposes **Continue with Google**.
* **Google IdP** must be enabled in teacher-wang-infra (`TF_VAR_cognito_google_client_*`); until then Cognito will reject the Google provider on authorize.
* The client also supports Cognito tokens via Amplify Auth / Hosted UI for other flows. Exact UI chrome beyond the welcome screen is left to product polish.

### Application user row (Postgres)

* Cognito is the source of truth for **credentials**.
* On every successful authenticated request, `ensure_current_user()` upserts the `users` row keyed by the Cognito `sub`, mirroring `username` and `email` for app queries and display, and refreshing `last_connexion`.
* The `sub` **is** the tenant id: there is no separate internal user UUID. Domain ownership is described in the data-isolation decision—not in this document.

### API protection (Flask)

* A `before_request` hook protects **every** route. Only `OPTIONS` (CORS preflight) and `GET /health` are public.
* Protected routes require an `Authorization: Bearer <access_token>` JWT. Flask verifies it against the User Pool JWKS (issuer, audience/client id, expiry, signature). Invalid or missing tokens → `401`.
* Clients may also send the ID token in an `X-Id-Token` header. When present it is verified (`token_use=id`, `aud=client_id`) and its `email` claim is mirrored into the `users` row.
* The tenant is resolved before the view runs, so handlers read it from `current_user_id()` instead of re-parsing claims.

### Interaction overview

```text
Browser
  │
  ├─ signup / login / Google SSO ──► Cognito User Pool
  │                                      │
  │                                      ▼
  │                                 JWT tokens
  │                                      │
  └─ API calls + Bearer JWT ────────────► Flask
     (+ optional X-Id-Token)               │
                           verify JWT (JWKS)│
                        ensure_current_user │
                                           ▼
                                      Postgres (RDS)
                                  users + domain data
                           (see data-isolation decision)
```

## Out of scope (remaining)

* PostgreSQL RLS as a backstop behind the app-level `user_id` filters — [data-isolation ADR](./data-isolation.md).
* Enabling Google IdP (infra supports it when `TF_VAR_cognito_google_client_*` are set).

## Consequences

### Advantages

* Password material never sits in RDS; Cognito owns hashing, recovery, and Google SSO.
* Matches the accepted infra multi-user decision and AWS cost posture (~$0 Cognito under early MAU free tier).
* ECS can receive pool id / client id / region via env; optional Secrets Manager for the Google OAuth client secret (infra).

### Drawbacks / follow-ups

* Cognito User Pool / app client / optional Google IdP are provisioned in **teacher-wang-infra**; Flask verifies access tokens via JWKS (`backend/auth.py`) and resolves the tenant in `backend/user_context.py`.
* The welcome screen signs in / signs up via Cognito `USER_PASSWORD_AUTH` / `SignUp` (`frontend/src/utils/auth/cognitoAuth.ts`); tokens live in `sessionStorage` and are attached by `frontend/src/utils/auth/apiFetch.ts`.
* Every request now pays a JWKS-cached signature check plus one `users` upsert; a busy session writes `last_connexion` on each call.
* Local and CI need Cognito env vars (or mocks) for protected routes — see `.env.example` (`COGNITO_*` backend, `VITE_COGNITO_*` frontend). Route unit tests stub verification through `backend/tests/auth_stub.py`.
* Migration away from Cognito later is painful (hashes not exportable)—accept re-registration or a dual-run plan if that ever matters.
* Auth alone does not isolate knowledge-base rows; the row-level scoping lives in [data isolation](./data-isolation.md).
