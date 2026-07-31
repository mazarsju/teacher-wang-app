"""Authenticated identity probe — reflects the Cognito token and the user row."""

from flask import Blueprint, jsonify

from backend.auth import current_cognito_claims, current_cognito_sub
from backend.user_context import current_user

bp = Blueprint("auth_me", __name__)


@bp.get("/auth/me")
def auth_me():
    claims = current_cognito_claims() or {}
    user = current_user()
    return jsonify(
        {
            "sub": current_cognito_sub(),
            "username": user.username,
            "email": user.email,
            "plan": user.plan,
            "token_use": claims.get("token_use"),
            "client_id": claims.get("client_id"),
        }
    )
