#!/usr/bin/env bash
# Build linux/arm64 images and push to ECR (ECS Spot uses Graviton t4g).
#
# Prerequisites (from teacher-wang-infra / environments/prod):
#   source ../../config
#   export AWS_REGION="$(terraform output -raw aws_region)"
#   export ECR_BACKEND="$(terraform output -raw ecr_backend_repository_url)"
#   export ECR_FRONTEND="$(terraform output -raw ecr_frontend_repository_url)"
#   aws ecr get-login-password --region "$AWS_REGION" \
#     | docker login --username AWS --password-stdin "$(echo "$ECR_BACKEND" | cut -d/ -f1)"
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

build_push() {
  local name="$1"
  local dockerfile="$2"
  local repo="$3"

  echo "→ Building and pushing ${name} (${PLATFORM}) → ${repo}:latest and :${GIT_SHA}"
  docker buildx build \
    --platform "${PLATFORM}" \
    -f "${dockerfile}" \
    -t "${repo}:latest" \
    -t "${repo}:${GIT_SHA}" \
    --push \
    .
}

case "${TARGET}" in
  all)
    build_push backend backend/Dockerfile "${ECR_BACKEND}"
    build_push frontend frontend/Dockerfile "${ECR_FRONTEND}"
    ;;
  backend)
    build_push backend backend/Dockerfile "${ECR_BACKEND}"
    ;;
  frontend)
    build_push frontend frontend/Dockerfile "${ECR_FRONTEND}"
    ;;
  *)
    echo "Usage: $0 [all|backend|frontend]" >&2
    exit 1
    ;;
esac

echo "Done. Images tagged :latest and :${GIT_SHA}"
