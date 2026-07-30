"""Authenticated identity probe — used to verify Cognito JWT wiring."""

from flask import Blueprint, jsonify

from backend.auth import current_cognito_claims, current_cognito_sub, require_auth

bp = Blueprint("auth_me", __name__)


@bp.get("/auth/me")
@require_auth
def auth_me():
    claims = current_cognito_claims() or {}
    return jsonify(
        {
            "sub": current_cognito_sub(),
            "username": claims.get("username"),
            "token_use": claims.get("token_use"),
            "client_id": claims.get("client_id"),
        }
    )
