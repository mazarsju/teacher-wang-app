"""Cognito JWT verification for protected Flask routes."""

from __future__ import annotations

from typing import Any

import jwt
from flask import g
from jwt import PyJWKClient

from backend.auth_config import CognitoConfig, load_cognito_config

_jwks_clients: dict[str, PyJWKClient] = {}


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _jwks_client(config: CognitoConfig) -> PyJWKClient:
    client = _jwks_clients.get(config.jwks_url)
    if client is None:
        client = PyJWKClient(config.jwks_url, cache_keys=True)
        _jwks_clients[config.jwks_url] = client
    return client


def extract_bearer_token(authorization_header: str | None) -> str:
    if not authorization_header:
        raise AuthError("Missing Authorization header")
    parts = authorization_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise AuthError("Authorization header must be: Bearer <token>")
    return parts[1]


def _require_config(config: CognitoConfig | None) -> CognitoConfig:
    cfg = config if config is not None else load_cognito_config()
    if cfg is None:
        raise AuthError("Cognito is not configured on this server", status_code=503)
    return cfg


def verify_access_token(
    token: str,
    config: CognitoConfig | None = None,
) -> dict[str, Any]:
    """Validate a Cognito access token and return its claims."""
    cfg = _require_config(config)

    try:
        signing_key = _jwks_client(cfg).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=cfg.issuer,
            options={
                "require": ["exp", "iss", "sub", "token_use"],
                "verify_aud": False,
            },
        )
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid token: {exc}") from exc

    if claims.get("token_use") != "access":
        raise AuthError("Token is not a Cognito access token")

    # Cognito access tokens carry client_id (not standard aud).
    if claims.get("client_id") != cfg.app_client_id:
        raise AuthError("Token audience (client_id) mismatch")

    return claims


def verify_id_token(
    token: str,
    config: CognitoConfig | None = None,
) -> dict[str, Any]:
    """Validate a Cognito ID token; used only to read verified profile claims."""
    cfg = _require_config(config)

    try:
        signing_key = _jwks_client(cfg).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=cfg.issuer,
            audience=cfg.app_client_id,
            options={"require": ["exp", "iss", "sub", "aud", "token_use"]},
        )
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid ID token: {exc}") from exc

    if claims.get("token_use") != "id":
        raise AuthError("Token is not a Cognito ID token")

    return claims


def current_cognito_sub() -> str | None:
    return getattr(g, "cognito_sub", None)


def current_cognito_claims() -> dict[str, Any] | None:
    return getattr(g, "cognito_claims", None)
