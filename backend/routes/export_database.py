from flask import Blueprint
import io
import zipfile
from flask import send_file
from backend.utils.database.db_export import get_export_database_content
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("export_database", __name__)


@bp.post("/database/export")
def export_database():
    content = get_export_database_content(current_user_id())

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("teacher-wang-export.csv", content)

    zip_buffer.seek(0)

    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="teacher-wang-export.zip",
    )
