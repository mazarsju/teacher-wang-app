"""Per-request authentication and tenant resolution.

Every request except ``OPTIONS``, ``/health`` and the password-reset routes
(reached before the user has a session) must carry a Cognito access
token. The verified ``sub`` claim identifies the account: it is upserted into
``users`` and the row's ``shortid`` is exposed through ``current_user_id()``,
which every query on a private table must filter on.
"""

from __future__ import annotations

from decimal import Decimal

from flask import Flask, g, jsonify, request
from sqlalchemy import text

from backend.utils.auth.auth import (
    AuthError,
    extract_bearer_token,
    verify_access_token,
    verify_id_token,
)
from backend.utils.database.extensions import db
from backend.utils.database.models import DEFAULT_USER_PLAN, User, utcnow

ID_TOKEN_HEADER = "X-Id-Token"
PUBLIC_PATHS = frozenset(
    {"/health", "/auth/forgot-password", "/auth/reset-password"}
)


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


def _rematch_user_sub(existing: User, new_sub: str) -> User:
    """Move ``users.id`` to a new Cognito ``sub`` while keeping ``shortid``.

    Cognito can mint a fresh ``sub`` for the same username after a User Pool
    recreate; private tables FK to ``shortid``, so rematching is safe.
    """
    old_id = existing.id
    if old_id == new_sub:
        return existing
    # Drop the stale identity-map entry before rewriting the PK in SQL.
    db.session.expunge(existing)
    db.session.execute(
        text("UPDATE users SET id = :new_id WHERE id = :old_id"),
        {"new_id": new_sub, "old_id": old_id},
    )
    db.session.commit()
    user = db.session.get(User, new_sub)
    if user is None:
        raise RuntimeError("Failed to rematch Cognito subject onto users row")
    return user


def ensure_current_user() -> User:
    """Upsert the ``users`` row for the authenticated Cognito subject."""
    claims = getattr(g, "cognito_claims", None) or {}
    sub = g.cognito_sub
    username = _username_from_claims(claims, sub)
    email = _verified_email(sub)

    user = db.session.get(User, sub)
    if user is None:
        # Same Cognito username, different sub (e.g. User Pool recreate).
        existing = User.query.filter_by(username=username).one_or_none()
        if existing is not None:
            user = _rematch_user_sub(existing, sub)
        else:
            user = User(
                id=sub,
                username=username,
                email=email or _placeholder_email(sub),
                plan=DEFAULT_USER_PLAN,
                last_connection=utcnow(),
            )
            db.session.add(user)
            db.session.commit()
            _ensure_user_defaults(user.shortid)
            g.current_user = user
            g.current_user_id = user.shortid
            return user

    previous_connection = user.last_connection
    user.username = username
    if email is not None:
        user.email = email
    new_connection = utcnow()
    user.last_connection = new_connection
    db.session.commit()
    # Seed any newly introduced default keys (e.g. available_token).
    _ensure_user_defaults(user.shortid)
    if (previous_connection.year, previous_connection.month) < (
        new_connection.year,
        new_connection.month,
    ):
        _reset_monthly_tokens(user)

    g.current_user = user
    g.current_user_id = user.shortid
    return user


def _ensure_user_defaults(user_id) -> None:
    """Seed the per-user settings rows a fresh account needs."""
    from backend.utils.database.settings import ensure_default_settings

    ensure_default_settings(user_id)


def _reset_monthly_tokens(user: User) -> None:
    """Refill the plan's token allowance when a new calendar month starts."""
    from backend.utils.database.settings import reset_available_token

    reset_available_token(user.shortid, user.plan, commit=True)


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


def current_user_id() -> Decimal:
    """Return the tenant key for private tables (``users.shortid``)."""
    user_id = getattr(g, "current_user_id", None)
    if user_id is None:
        raise RuntimeError("No authenticated user in the current request context")
    return user_id


def current_user() -> User:
    user = getattr(g, "current_user", None)
    if user is not None:
        return user
    sub = getattr(g, "cognito_sub", None)
    if not sub:
        raise RuntimeError("Authenticated user row is missing")
    user = db.session.get(User, sub)
    if user is None:
        raise RuntimeError("Authenticated user row is missing")
    return user
