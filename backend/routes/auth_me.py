"""Authenticated identity probe — reflects the Cognito token and the user row."""

from flask import Blueprint, jsonify

from backend.utils.auth.auth import current_cognito_claims, current_cognito_sub
from backend.utils.database.settings import ADMIN_EMAIL
from backend.utils.auth.user_context import current_user

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
            "language": user.language,
            "is_admin": user.email == ADMIN_EMAIL,
            "token_use": claims.get("token_use"),
            "client_id": claims.get("client_id"),
        }
    )
