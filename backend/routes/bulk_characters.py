import csv
import io
from datetime import datetime

from flask import Blueprint, request

from backend.character_sync import rebuild_characters_from_words, serialize_character
from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Word, utcnow
from backend.user_context import current_user_id

bp = Blueprint("bulk_characters", __name__)

CSV_HEADER = ["word", "definition", "pinyin", "writting_known", "synchronized", "updated_at"]


def _parse_updated_at(value: str) -> datetime | None:
    if not value.strip():
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"Invalid updated_at value: {value}") from exc


@bp.post("/characters/bulk")
def bulk_characters():
    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return {"error": "No file provided"}, 400

    file_content = uploaded_file.read().decode("utf-8")
    user_id = current_user_id()

    rows = [row for row in csv.reader(io.StringIO(file_content)) if row]
    if rows and rows[0] == CSV_HEADER:
        rows = rows[1:]

    for row in rows:
        if len(row) != len(CSV_HEADER):
            return {
                "error": (
                    "Invalid line format. Should have the format "
                    f"'{','.join(CSV_HEADER)}'."
                    f"(error found in line: {','.join(row)})"
                )
            }, 400

        word_text, definition, pinyin, writting_known_raw, synchronized_raw, updated_at_raw = row
        try:
            updated_at = _parse_updated_at(updated_at_raw)
        except ValueError as exc:
            return {"error": f"{exc} (error found in line: {','.join(row)})"}, 400

        word_record = Word.query.filter_by(user_id=user_id, word=word_text).first()
        if word_record is None:
            word_record = Word(user_id=user_id, word=word_text)
            db.session.add(word_record)

        word_record.definition = definition or None
        word_record.pinyin = pinyin or None
        word_record.writting_known = writting_known_raw == "true"
        word_record.anki_voc_sync = synchronized_raw == "true"
        word_record.updated_at = updated_at if updated_at is not None else utcnow()

    sync_result = rebuild_characters_from_words(user_id)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "message": "File received",
        "updated_characters": [
            serialize_character(character)
            for character in sync_result.updated_characters
        ],
        "deleted_char_ids": sync_result.deleted_char_ids,
    }, 200
