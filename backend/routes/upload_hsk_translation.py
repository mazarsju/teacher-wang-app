import io
import json
import zipfile

from flask import Blueprint, request

from backend.utils.auth.user_context import current_user
from backend.utils.database.extensions import db
from backend.utils.database.models import HskWord, HskWordTranslation
from backend.utils.database.settings import ADMIN_EMAIL

bp = Blueprint("upload_hsk_translation", __name__)


def _read_json_entries(file_bytes: bytes) -> list:
    if not zipfile.is_zipfile(io.BytesIO(file_bytes)):
        raise ValueError("File must be a zip archive")

    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        json_names = [
            name
            for name in archive.namelist()
            if name.lower().endswith(".json") and "__MACOSX" not in name
        ]
        if not json_names:
            raise ValueError("No JSON file found in the zip archive")
        return json.loads(archive.read(json_names[0]))


@bp.post("/admin/hsk/translation")
def upload_hsk_translation():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return {"error": "No file provided"}, 400

    language = (request.form.get("language") or "").strip().lower()
    if len(language) != 2:
        return {"error": "language must be a 2-letter code"}, 400

    try:
        entries = _read_json_entries(uploaded_file.read())
    except (ValueError, zipfile.BadZipFile) as exc:
        return {"error": str(exc)}, 400
    except json.JSONDecodeError:
        return {"error": "Invalid JSON content in the zip archive"}, 400

    if not isinstance(entries, list):
        return {"error": "JSON content must be a list of entries"}, 400

    for entry in entries:
        hsk_word_id = entry.get("id")
        definition = entry.get("definition")
        if not hsk_word_id or definition is None:
            return {"error": f"Invalid entry, expected id/definition: {entry}"}, 400

        hsk_word = db.session.get(HskWord, hsk_word_id)
        if hsk_word is None:
            return {"error": f"Unknown hsk_word_id: {hsk_word_id}"}, 400

        if language == "en":
            hsk_word.definition = definition
            continue

        translation = db.session.get(HskWordTranslation, (hsk_word_id, language))
        if translation is None:
            translation = HskWordTranslation(hsk_word_id=hsk_word_id, language=language)
            db.session.add(translation)
        translation.translate = definition

    db.session.commit()

    return {
        "message": "HSK translations loaded",
        "language": language,
        "count": len(entries),
    }, 200
