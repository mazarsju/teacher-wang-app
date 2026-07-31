#!/usr/bin/env bash
# Build linux/arm64 images and push to ECR (ECS Spot uses Graviton t4g).
#
# Prerequisites (from teacher-wang-infra / environments/prod):
#   source ../../config
#   export AWS_REGION="$(terraform output -raw aws_region)"
#   export ECR_BACKEND="$(terraform output -raw ecr_backend_repository_url)"
#   export ECR_FRONTEND="$(terraform output -raw ecr_frontend_repository_url)"
#   export COGNITO_REGION="$AWS_REGION"
#   export COGNITO_USER_POOL_ID="$(terraform output -raw cognito_user_pool_id)"
#   export COGNITO_APP_CLIENT_ID="$(terraform output -raw cognito_app_client_id)"
#   export COGNITO_ISSUER="$(terraform output -raw cognito_issuer)"
#   export COGNITO_DOMAIN="$(terraform output -raw cognito_domain)"
#   aws ecr get-login-password --region "$AWS_REGION" \
#     | docker login --username AWS --password-stdin "$(echo "$ECR_BACKEND" | cut -d/ -f1)"
#
# Prefer the skill wrapper (reads all of the above for you):
#   .cursor/skills/update-ecr-images/scripts/push.sh
#
# Usage (from repo root):
#   ./scripts/push-ecr.sh
#   ./scripts/push-ecr.sh backend    # backend only
#   ./scripts/push-ecr.sh frontend   # frontend only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-all}"
PLATFORM="${PLATFORM:-linux/arm64}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"

if [[ -z "${ECR_BACKEND:-}" || -z "${ECR_FRONTEND:-}" ]]; then
  echo "Set ECR_BACKEND and ECR_FRONTEND (see teacher-wang-infra README → Push images to ECR)." >&2
  exit 1
fi

build_push_backend() {
  local repo="$1"

  echo "→ Building and pushing backend (${PLATFORM}) → ${repo}:latest and :${GIT_SHA}"
  docker buildx build \
    --platform "${PLATFORM}" \
    -f backend/Dockerfile \
    -t "${repo}:latest" \
    -t "${repo}:${GIT_SHA}" \
    --push \
    .
}

build_push_frontend() {
  local repo="$1"

  if [[ -z "${COGNITO_USER_POOL_ID:-}" || -z "${COGNITO_APP_CLIENT_ID:-}" ]]; then
    echo "Set COGNITO_* from terraform outputs (wrapper does this) so the SPA can talk to Cognito." >&2
    exit 1
  fi

  echo "→ Building and pushing frontend (${PLATFORM}) → ${repo}:latest and :${GIT_SHA}"
  echo "  Vite Cognito build-args: pool=${COGNITO_USER_POOL_ID} client=${COGNITO_APP_CLIENT_ID}"
  docker buildx build \
    --platform "${PLATFORM}" \
    -f frontend/Dockerfile \
    --build-arg "VITE_COGNITO_REGION=${COGNITO_REGION:-${AWS_REGION:-}}" \
    --build-arg "VITE_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}" \
    --build-arg "VITE_COGNITO_APP_CLIENT_ID=${COGNITO_APP_CLIENT_ID}" \
    --build-arg "VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN:-}" \
    --build-arg "VITE_COGNITO_ISSUER=${COGNITO_ISSUER:-}" \
    -t "${repo}:latest" \
    -t "${repo}:${GIT_SHA}" \
    --push \
    .
}

case "${TARGET}" in
  all)
    build_push_backend "${ECR_BACKEND}"
    build_push_frontend "${ECR_FRONTEND}"
    ;;
  backend)
    build_push_backend "${ECR_BACKEND}"
    ;;
  frontend)
    build_push_frontend "${ECR_FRONTEND}"
    ;;
  *)
    echo "Usage: $0 [all|backend|frontend]" >&2
    exit 1
    ;;
esac

echo "Done. Images tagged :latest and :${GIT_SHA}"
