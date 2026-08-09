"""Public password-reset endpoints, reached before the user has a session.

The frontend only collects an email; Cognito's ForgotPassword needs the
Cognito username, so this bridges email -> username via the ``users`` table
and never reveals whether a given email is registered.
"""

from __future__ import annotations

import logging

from flask import Blueprint, request

from backend.cognito_public import (
    CognitoPublicError,
    confirm_forgot_password,
    forgot_password,
)
from backend.models import User

bp = Blueprint("auth_password_reset", __name__)
logger = logging.getLogger(__name__)

GENERIC_SENT_MESSAGE = "If an account with that email exists, a reset code has been sent."


@bp.post("/auth/forgot-password")
def request_password_reset():
    email = str((request.get_json(silent=True) or {}).get("email", "")).strip()
    if not email:
        return {"error": "email is required"}, 400

    user = User.query.filter_by(email=email).first()
    if user is not None:
        try:
            forgot_password(user.username)
        except CognitoPublicError:
            logger.exception("Failed to trigger Cognito ForgotPassword")

    return {"message": GENERIC_SENT_MESSAGE}, 200


@bp.post("/auth/reset-password")
def confirm_password_reset():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip()
    code = str(body.get("code", "")).strip()
    new_password = str(body.get("newPassword", "")).strip()
    if not email or not code or not new_password:
        return {"error": "email, code and newPassword are required"}, 400

    user = User.query.filter_by(email=email).first()
    if user is None:
        return {"error": "Invalid code or email"}, 400

    try:
        confirm_forgot_password(user.username, code, new_password)
    except CognitoPublicError as exc:
        return {"error": exc.message}, 400

    return {"message": "Password updated."}, 200
