"""Cognito settings for JWT verification (env-driven)."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class CognitoConfig:
    region: str
    user_pool_id: str
    app_client_id: str
    issuer: str

    @property
    def jwks_url(self) -> str:
        return f"{self.issuer}/.well-known/jwks.json"

    @property
    def configured(self) -> bool:
        return bool(self.region and self.user_pool_id and self.app_client_id and self.issuer)


def load_cognito_config() -> CognitoConfig | None:
    """Return Cognito config when all required env vars are set; otherwise None."""
    region = os.environ.get("COGNITO_REGION", "").strip()
    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID", "").strip()
    app_client_id = os.environ.get("COGNITO_APP_CLIENT_ID", "").strip()
    issuer = os.environ.get("COGNITO_ISSUER", "").strip()

    if not issuer and region and user_pool_id:
        issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"

    config = CognitoConfig(
        region=region,
        user_pool_id=user_pool_id,
        app_client_id=app_client_id,
        issuer=issuer,
    )
    return config if config.configured else None
