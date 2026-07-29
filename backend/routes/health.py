from flask import Blueprint
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from backend.extensions import db

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    """Liveness/readiness: process is up and Postgres accepts a simple query."""
    try:
        db.session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return (
            {
                "status": "unhealthy",
                "service": "backend",
                "database": "down",
            },
            503,
        )

    return {
        "status": "ok",
        "service": "backend",
        "database": "up",
    }, 200
