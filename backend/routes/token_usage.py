from flask import Blueprint

from backend.token_usage import get_token_usage_summary

bp = Blueprint("token_usage", __name__)


@bp.get("/token-usage")
def token_usage():
    return get_token_usage_summary(), 200
