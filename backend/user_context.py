"""Per-request authentication and tenant resolution.

Every request except ``OPTIONS`` and ``/health`` must carry a Cognito access
token. The verified ``sub`` claim identifies the tenant: it is upserted into
``users`` and exposed to the rest of the request through ``current_user_id()``,
which every query on a private table must filter on.
"""

from __future__ import annotations

from flask import Flask, g, jsonify, request

from backend.auth import (
    AuthError,
    extract_bearer_token,
    verify_access_token,
    verify_id_token,
)
from backend.extensions import db
from backend.models import DEFAULT_USER_PLAN, User, utcnow

ID_TOKEN_HEADER = "X-Id-Token"
PUBLIC_PATHS = frozenset({"/health"})


def _is_public_request() -> bool:
    return request.method == "OPTIONS" or request.path in PUBLIC_PATHS


def _username_from_claims(claims: dict, sub: str) -> str:
    username = str(claims.get("username") or claims.get("cognito:username") or "")
    return username.strip() or sub


def _verified_email(sub: str) -> str | None:
    """Read the email claim from the optional ID token companion header."""
    raw = (request.headers.get(ID_TOKEN_HEADER) or "").strip()
    if raw == "":
        return None

    try:
        claims = verify_id_token(raw)
    except AuthError:
        return None

    if claims.get("sub") != sub:
        return None

    email = str(claims.get("email") or "").strip()
    return email or None


def _placeholder_email(sub: str) -> str:
    """Unique stand-in when no verified email is available (column is NOT NULL)."""
    return f"{sub}@users.local"


def ensure_current_user() -> User:
    """Upsert the ``users`` row for the authenticated Cognito subject."""
    claims = getattr(g, "cognito_claims", None) or {}
    sub = g.cognito_sub
    username = _username_from_claims(claims, sub)
    email = _verified_email(sub)

    user = db.session.get(User, sub)
    if user is None:
        user = User(
            id=sub,
            username=username,
            email=email or _placeholder_email(sub),
            plan=DEFAULT_USER_PLAN,
            last_connexion=utcnow(),
        )
        db.session.add(user)
        db.session.commit()
        _ensure_user_defaults(user.id)
    else:
        user.username = username
        if email is not None:
            user.email = email
        user.last_connexion = utcnow()
        db.session.commit()

    g.current_user_id = user.id
    return user


def _ensure_user_defaults(user_id: str) -> None:
    """Seed the per-user settings rows a fresh account needs."""
    from backend.settings import ensure_default_settings

    ensure_default_settings(user_id)


def authenticate_request():
    """``before_request`` hook: reject anonymous calls, then resolve the tenant."""
    if _is_public_request():
        return None

    try:
        token = extract_bearer_token(request.headers.get("Authorization"))
        claims = verify_access_token(token)
    except AuthError as exc:
        return jsonify({"error": exc.message}), exc.status_code

    g.cognito_claims = claims
    g.cognito_sub = claims["sub"]
    ensure_current_user()
    return None


def register_user_context(app: Flask) -> None:
    app.before_request(authenticate_request)


def current_user_id() -> str:
    user_id = getattr(g, "current_user_id", None)
    if not user_id:
        raise RuntimeError("No authenticated user in the current request context")
    return user_id


def current_user() -> User:
    user = db.session.get(User, current_user_id())
    if user is None:
        raise RuntimeError("Authenticated user row is missing")
    return user
