"""Cognito JWT verification for protected Flask routes."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, TypeVar

import jwt
from flask import g, jsonify, request
from jwt import PyJWKClient

from backend.auth_config import CognitoConfig, load_cognito_config

F = TypeVar("F", bound=Callable[..., Any])

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


def verify_access_token(token: str, config: CognitoConfig | None = None) -> dict[str, Any]:
    """Validate a Cognito access token and return its claims."""
    cfg = config if config is not None else load_cognito_config()
    if cfg is None:
        raise AuthError("Cognito is not configured on this server", status_code=503)

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


def require_auth(view: F) -> F:
    """Decorator: require a valid Cognito access token; store claims on flask.g."""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        try:
            token = extract_bearer_token(request.headers.get("Authorization"))
            claims = verify_access_token(token)
        except AuthError as exc:
            return jsonify({"error": exc.message}), exc.status_code

        g.cognito_claims = claims
        g.cognito_sub = claims["sub"]
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def current_cognito_sub() -> str | None:
    return getattr(g, "cognito_sub", None)


def current_cognito_claims() -> dict[str, Any] | None:
    return getattr(g, "cognito_claims", None)
