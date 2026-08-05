#!/usr/bin/env bash
# Full ECR login + push flow for teacher-wang images.
# Paths assume this app repo and a sibling teacher-wang-infra checkout.
#
# Usage (from app repo root, or any cwd — script locates roots):
#   .claude/skills/update-ecr-images/scripts/push.sh
#   .claude/skills/update-ecr-images/scripts/push.sh backend
#   .claude/skills/update-ecr-images/scripts/push.sh frontend

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

# Avoid `docker info | grep -q`: with pipefail, grep -q exits early and docker
# gets SIGPIPE (exit 141), which falsely looks like a failed daemon check.
DOCKER_INFO="$(docker info 2>/dev/null || true)"
if ! grep -qi "Server Version" <<<"$DOCKER_INFO"; then
  echo "Docker client is present but the daemon/engine is not up. Start Docker Desktop." >&2
  open -a Docker 2>/dev/null || true
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$INFRA_ROOT/config"
set +a

cd "$INFRA_ROOT/environments/prod"
AWS_REGION="$(terraform output -raw aws_region)"
ECR_BACKEND="$(terraform output -raw ecr_backend_repository_url)"
ECR_FRONTEND="$(terraform output -raw ecr_frontend_repository_url)"

# Public Cognito ids (from Terraform). Backend also gets these at runtime via the
# ECS task definition; the frontend SPA needs them as Vite build-args.
COGNITO_REGION="$AWS_REGION"
COGNITO_USER_POOL_ID="$(terraform output -raw cognito_user_pool_id)"
COGNITO_APP_CLIENT_ID="$(terraform output -raw cognito_app_client_id)"
COGNITO_ISSUER="$(terraform output -raw cognito_issuer)"
COGNITO_DOMAIN="$(terraform output -raw cognito_domain)"

export AWS_REGION ECR_BACKEND ECR_FRONTEND
export COGNITO_REGION COGNITO_USER_POOL_ID COGNITO_APP_CLIENT_ID COGNITO_ISSUER COGNITO_DOMAIN

echo "Cognito pool=${COGNITO_USER_POOL_ID} client=${COGNITO_APP_CLIENT_ID} domain=${COGNITO_DOMAIN}"

# Important: do not wrap the registry host in extra quotes (breaks TLS hostname).
REGISTRY="${ECR_BACKEND%%/*}"
echo "Logging into ECR registry ${REGISTRY} (region ${AWS_REGION})…"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

cd "$APP_ROOT"
./scripts/push-ecr.sh "$TARGET"

# Pushing :latest alone does not restart running tasks — force ECS to pull again.
cd "$INFRA_ROOT/environments/prod"
CLUSTER="$(terraform output -raw ecs_cluster_name)"
BACKEND_SVC="$(terraform output -raw ecs_backend_service_name)"
FRONTEND_SVC="$(terraform output -raw ecs_frontend_service_name)"

redeploy_service() {
  local service="$1"
  echo "Forcing new ECS deployment: cluster=${CLUSTER} service=${service}…"
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$service" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --query 'service.{name:serviceName,status:status,desired:desiredCount,running:runningCount,rollout:deployments[0].rolloutState}' \
    --output json
}

case "$TARGET" in
  all)
    redeploy_service "$BACKEND_SVC"
    redeploy_service "$FRONTEND_SVC"
    ;;
  backend)
    redeploy_service "$BACKEND_SVC"
    ;;
  frontend)
    redeploy_service "$FRONTEND_SVC"
    ;;
  *)
    echo "Unknown target '${TARGET}' (expected all|backend|frontend); skipping ECS redeploy." >&2
    ;;
esac

cd "$APP_ROOT"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
echo "Pushed target=${TARGET} tags=:latest and :${GIT_SHA}"
echo "ECS force-new-deployment requested for target=${TARGET} (rollout continues asynchronously)."
