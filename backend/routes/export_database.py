from flask import Blueprint

from backend.db_export import DB_EXPORT_FILENAME, export_database_to_file
from backend.user_context import current_user_id

bp = Blueprint("export_database", __name__)


@bp.post("/database/export")
def export_database():
    export_database_to_file(current_user_id())
    return {
        "message": f"Database exported to {DB_EXPORT_FILENAME}",
        "filename": DB_EXPORT_FILENAME,
    }, 200
