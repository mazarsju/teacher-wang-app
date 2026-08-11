---
name: update-ecr-images
description: >-
  Builds linux/arm64 backend and frontend Docker images and pushes them to AWS
  ECR for teacher-wang ECS. Use when the user asks to update ECR images, push
  Docker images to AWS, rebuild/redeploy frontend or backend containers, or run
  the README “Push images to AWS ECR” steps.
---

# Update ECR images

Push **teacher-wang** container images to the ECR repos provisioned by the sibling
**teacher-wang-infra** Terraform stack. Prefer the wrapper script below over
re-typing manual docker/terraform commands (quoting mistakes break ECR login).

Container ports, `/api` proxy, and healthchecks: `docs/deployment/ecs-containers.md`.
Coding invariants when editing Dockerfiles: `.cursor/rules/ecs-containers.mdc`.

**ECS does not auto-load a new `:latest` image.** After push, the wrapper forces a
new deployment so running tasks pull again.

## Layout assumptions

| Path | Role |
| --- | --- |
| This repo | App (`learn-mandarin` / teacher-wang-app) |
| `../teacher-wang-infra` | Infra (must contain gitignored `config` + `environments/prod`) |
| `backend/Dockerfile` | Backend image (gunicorn `:5000`) |
| `frontend/Dockerfile` | Frontend image (nginx `:80`) |
| `scripts/push-ecr.sh` | `docker buildx … --push` for one or both images |
| `.cursor/skills/update-ecr-images/scripts/push.sh` | Full login + push + ECS redeploy |

Build context is always the **app repo root**. Platform must be **`linux/arm64`**.

## Workflow

Copy this checklist and track progress:

```
ECR image update:
- [ ] Docker daemon up (Server section in docker info)
- [ ] teacher-wang-infra/config present
- [ ] ECR login succeeded
- [ ] push-ecr.sh finished for requested target
- [ ] ECS force-new-deployment requested for matching service(s)
- [ ] Report tags (:latest + git SHA) to the user
```

### 1. Prerequisites

- Docker Desktop installed; daemon running.
- AWS CLI + Terraform available.
- Sibling checkout: `../teacher-wang-infra` with `config` filled from `config.example`.
- ECR repos already created (`terraform apply` in infra at least once).
- ECS services enabled (`enable_ecs = true`) so force-new-deployment has targets.

### 2. Run the wrapper (preferred)

From the **app repo root**, with Shell permissions that can reach the Docker
socket and the network (`all` / unrestricted as needed). Force-new-deployment is a
**prod write** — if Auto-review blocks it, ask the user to approve.

```bash
.cursor/skills/update-ecr-images/scripts/push.sh           # both
.cursor/skills/update-ecr-images/scripts/push.sh backend
.cursor/skills/update-ecr-images/scripts/push.sh frontend
```

Expect several minutes on a cold build; warm builds often finish in ~20–60s.
ECS rollout continues asynchronously after the script returns.

### 3. What the script does

1. Verifies Docker daemon is up (`open -a Docker` hint if not).
2. `source ../teacher-wang-infra/config` (AWS keys — never print them).
3. In `teacher-wang-infra/environments/prod`, reads terraform outputs for region,
   ECR URLs, and public Cognito ids → exports `ECR_*` / `COGNITO_*`.
4. Logs into ECR (`REGISTRY="${ECR_BACKEND%%/*}"` — no nested quotes).
5. Runs `./scripts/push-ecr.sh` (tags `:latest` and `:<git-sha>`; frontend gets
   `VITE_COGNITO_*` build-args; buildx uses `--provenance=false --sbom=false` so
   `:latest` cannot land on an attestation stub). Backend Cognito still comes from
   the ECS task def.
6. Forces a new ECS deployment for the matching service(s).

### 4. Report back

Tell the user which target was pushed, the git SHA tag, and that ECS
force-new-deployment was requested (rollout may still be in progress). Do **not**
paste AWS access keys, secret keys, or `docker login` passwords into the chat.

## Pitfalls (learned from real runs)

| Symptom | Cause / fix |
| --- | --- |
| `Cannot connect to the Docker daemon … docker.sock` | Docker Desktop not running → `open -a Docker`, wait, re-check `docker info` shows Server / Server Version |
| Wrapper says daemon not up but `docker info` works | Do not use `docker info \| grep -q` under `pipefail` — grep exits early, docker gets SIGPIPE (141). Capture `docker info` then grep the string |
| TLS error: cert valid for `*.dkr.ecr…` but **not** `"account.dkr.ecr…` | Registry host was wrapped in literal quotes → use `REGISTRY="${ECR_BACKEND%%/*}"` (no nested `\"…\"`) |
| `Set ECR_BACKEND and ECR_FRONTEND` | Exports missing; always run the wrapper (or export after terraform outputs) |
| `Set COGNITO_* from terraform outputs` | Frontend build needs pool/client ids; run the wrapper after Cognito is applied |
| Huge frontend build context (~100MB+) | Root `.dockerignore` must exclude `**/node_modules/` (frontend/.dockerignore is ignored when context is `.`) |
| ECS tasks fail to start after push | Images must exist before / right after `enable_ecs = true`; platform must be `linux/arm64` |
| New image in ECR but app unchanged | ECS does not watch `:latest`; need `--force-new-deployment` (wrapper step 6) |
| `:latest` digest is tiny / attestation-only; git SHA tag is fine | Default buildx provenance left `:latest` on the stub — `push-ecr.sh` must use `--provenance=false --sbom=false`; retag the real index/image as `:latest` and force redeploy |

## Out of scope

- Enabling ECS / ALB (`enable_ecs` in infra).
- Applying Terraform or rotating AWS keys.
- Waiting for ECS rollout to reach `COMPLETED` (optional follow-up; not required).
- Pushing from CI (local Mac + Docker Desktop workflow only for now).
