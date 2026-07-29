#!/usr/bin/env bash
# Full ECR login + push flow for teacher-wang images.
# Paths assume this app repo and a sibling teacher-wang-infra checkout.
#
# Usage (from app repo root, or any cwd — script locates roots):
#   .cursor/skills/update-ecr-images/scripts/push.sh
#   .cursor/skills/update-ecr-images/scripts/push.sh backend
#   .cursor/skills/update-ecr-images/scripts/push.sh frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
INFRA_ROOT="$(cd "$APP_ROOT/../teacher-wang-infra" && pwd)"
TARGET="${1:-all}"

if [[ ! -f "$INFRA_ROOT/config" ]]; then
  echo "Missing $INFRA_ROOT/config (copy from config.example and fill AWS keys)." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start Docker Desktop, then retry:" >&2
  echo "  open -a Docker" >&2
  echo "  # wait until: docker info | grep -q Server" >&2
  exit 1
fi

if ! docker info 2>/dev/null | grep -q "^ Server:"; then
  # Some docker info layouts use "Server:" without leading space variants — also accept Server Version.
  if ! docker info 2>/dev/null | grep -qi "Server Version"; then
    echo "Docker client is present but the daemon/engine is not up. Start Docker Desktop." >&2
    open -a Docker 2>/dev/null || true
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1091
source "$INFRA_ROOT/config"
set +a

cd "$INFRA_ROOT/environments/prod"
AWS_REGION="$(terraform output -raw aws_region)"
ECR_BACKEND="$(terraform output -raw ecr_backend_repository_url)"
ECR_FRONTEND="$(terraform output -raw ecr_frontend_repository_url)"
export AWS_REGION ECR_BACKEND ECR_FRONTEND

# Important: do not wrap the registry host in extra quotes (breaks TLS hostname).
REGISTRY="${ECR_BACKEND%%/*}"
echo "Logging into ECR registry ${REGISTRY} (region ${AWS_REGION})…"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

cd "$APP_ROOT"
./scripts/push-ecr.sh "$TARGET"

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
echo "Pushed target=${TARGET} tags=:latest and :${GIT_SHA}"
