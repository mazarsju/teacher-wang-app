# Authentication & Credentials Architecture

## Status

Accepted

Aligned with Decision 1 in [teacher-wang-infra multi-user architecture](https://github.com/mazarsju/teacher-wang-infra/blob/main/docs/multi-user-archi-decision.md). Per-user data isolation is covered separately in [data-isolation-archi-decision.md](data-isolation-archi-decision.md).

## Context

Teacher Wang is a Flask API plus React UI deployed on AWS (ECS containers, RDS PostgreSQL via [teacher-wang-infra](https://github.com/mazarsju/teacher-wang-infra)). Today there is **no authentication**: APIs are open, Postgres holds a single shared knowledge base, and there is no users table.

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
| Private learner data and shared catalogs | See [data isolation](data-isolation-archi-decision.md) |

### Identity (Cognito)

* Sign-up collects **username**, **email**, and **password**. Cognito enforces uniqueness for username (and email as configured).
* Log-in uses **username + password** against the User Pool.
* **Google SSO** is a **federated identity provider** on the same pool (provisioned in Terraform in teacher-wang-infra)—not a second custom OAuth stack in Flask.
* The client obtains Cognito tokens (Amplify Auth, Cognito SDK, or Hosted UI). Exact UI library choice is left to implementation.
* Cognito password hashes are **not exportable**; treat Cognito as the durable IdP.

### Application user row (Postgres)

* Cognito is the source of truth for **credentials**.
* On first successful authenticated request (or after sign-up confirmation), ensure a thin `users` / `profiles` row with at least:
  * `cognito_sub` (unique, stable subject from the JWT)
  * `username` and `email` (mirrored for app queries / display)
* Domain ownership and RLS use this identity (internal user UUID and/or `cognito_sub`) as described in the data-isolation decision—not in this document.

### API protection (Flask)

* Protected routes require an `Authorization: Bearer <access_token>` JWT.
* Flask verifies the token against the User Pool JWKS (issuer, audience/client id, expiry, signature). Invalid or missing tokens → `401`.
* Handlers resolve the current user from `sub` (and the Postgres app user row) before touching domain data.

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
                                           │
                           verify JWT (JWKS)│
                                           ▼
                                      Postgres (RDS)
                                 profiles + domain data
                           (see data-isolation decision)
```

## Out of scope (remaining)

* Protecting all domain API routes with `@require_auth` (probe only: `GET /auth/me`).
* Per-user row ownership, RLS, partitioning, and shared catalogs — [data-isolation-archi-decision.md](data-isolation-archi-decision.md).
* Enabling Google IdP (infra supports it when `TF_VAR_cognito_google_client_*` are set).

## Consequences

### Advantages

* Password material never sits in RDS; Cognito owns hashing, recovery, and Google SSO.
* Matches the accepted infra multi-user decision and AWS cost posture (~$0 Cognito under early MAU free tier).
* ECS can receive pool id / client id / region via env; optional Secrets Manager for the Google OAuth client secret (infra).

### Drawbacks / follow-ups

* Cognito User Pool / app client / optional Google IdP are provisioned in **teacher-wang-infra**; Flask verifies access tokens via JWKS (`backend/auth.py`, probe route `GET /auth/me`).
* The welcome screen signs in / signs up via Cognito `USER_PASSWORD_AUTH` / `SignUp` (`frontend/src/utils/auth/cognitoAuth.ts`); tokens live in `sessionStorage`.
* Most domain routes are still open until route lockdown lands.
* Local and CI need Cognito env vars (or mocks) for protected routes — see `.env.example` (`COGNITO_*` backend, `VITE_COGNITO_*` frontend).
* Migration away from Cognito later is painful (hashes not exportable)—accept re-registration or a dual-run plan if that ever matters.
* Auth alone does not isolate knowledge-base rows; implement [data isolation](data-isolation-archi-decision.md) with multi-user auth.
