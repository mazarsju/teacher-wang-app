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
re-typing README commands (quoting mistakes break ECR login).

## Layout assumptions

| Path | Role |
| --- | --- |
| This repo | App (`learn-mandarin` / teacher-wang-app) |
| `../teacher-wang-infra` | Infra (must contain gitignored `config` + `environments/prod`) |
| `backend/Dockerfile` | Backend image (gunicorn `:5000`) |
| `frontend/Dockerfile` | Frontend image (nginx `:80`) |
| `scripts/push-ecr.sh` | `docker buildx … --push` for one or both images |
| `.cursor/skills/update-ecr-images/scripts/push.sh` | Full login + push orchestration |

Build context is always the **app repo root**. Platform must be **`linux/arm64`**
(Graviton / Apple Silicon).

## Workflow

Copy this checklist and track progress:

```
ECR image update:
- [ ] Docker daemon up (Server section in docker info)
- [ ] teacher-wang-infra/config present
- [ ] ECR login succeeded
- [ ] push-ecr.sh finished for requested target
- [ ] Report tags (:latest + git SHA) to the user
```

### 1. Prerequisites

- Docker Desktop installed; daemon running.
- AWS CLI + Terraform available.
- Sibling checkout: `../teacher-wang-infra` with `config` filled from `config.example`.
- ECR repos already created (`terraform apply` in infra at least once).

### 2. Run the wrapper (preferred)

From the **app repo root**, with Shell permissions that can reach the Docker
socket and the network (`all` / unrestricted as needed):

```bash
.cursor/skills/update-ecr-images/scripts/push.sh           # both
.cursor/skills/update-ecr-images/scripts/push.sh backend
.cursor/skills/update-ecr-images/scripts/push.sh frontend
```

Expect several minutes on a cold build; warm builds often finish in ~20–60s.

### 3. What the script does

1. Verifies Docker daemon is up (`open -a Docker` hint if not).
2. `source ../teacher-wang-infra/config` (AWS keys — never print them).
3. In `teacher-wang-infra/environments/prod`, reads:
   - `terraform output -raw aws_region`
   - `terraform output -raw ecr_backend_repository_url`
   - `terraform output -raw ecr_frontend_repository_url`
4. Logs into ECR with:
   ```bash
   REGISTRY="${ECR_BACKEND%%/*}"
   aws ecr get-login-password --region "$AWS_REGION" \
     | docker login --username AWS --password-stdin "$REGISTRY"
   ```
5. Runs `./scripts/push-ecr.sh` from the app root (tags `:latest` and `:<git-sha>`).

### 4. Report back

Tell the user which target was pushed and the git SHA tag. Do **not** paste AWS
access keys, secret keys, or `docker login` passwords into the chat.

## Pitfalls (learned from real runs)

| Symptom | Cause / fix |
| --- | --- |
| `Cannot connect to the Docker daemon … docker.sock` | Docker Desktop not running → `open -a Docker`, wait, re-check `docker info` shows Server / Server Version |
| TLS error: cert valid for `*.dkr.ecr…` but **not** `"account.dkr.ecr…` | Registry host was wrapped in literal quotes → use `REGISTRY="${ECR_BACKEND%%/*}"` (no nested `\"…\"`) |
| `Set ECR_BACKEND and ECR_FRONTEND` | Exports missing; always run the wrapper (or export after terraform outputs) |
| Huge frontend build context (~100MB+) | Root `.dockerignore` must exclude `**/node_modules/` (frontend/.dockerignore is ignored when context is `.`) |
| ECS tasks fail to start after push | Images must exist before / right after `enable_ecs = true`; platform must be `linux/arm64` |

## Manual README equivalent

Only if the wrapper cannot run. Same steps as README **Push images to AWS ECR**:
start Docker → source infra `config` → terraform outputs → ECR login →
`./scripts/push-ecr.sh`.

## Out of scope

- Enabling ECS / ALB (`enable_ecs` in infra).
- Applying Terraform or rotating AWS keys.
- Pushing from CI (local Mac + Docker Desktop workflow only for now).
