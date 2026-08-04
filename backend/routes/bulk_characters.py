from datetime import datetime

from flask import Blueprint, request

from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Character, Word, utcnow
from backend.user_context import current_user_id

bp = Blueprint("bulk_characters", __name__)

LINE_FORMAT = "character;pinyin;tone;is_known;words;updated_at"


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

    lines = file_content.split("\n")
    for line in lines:
        if line.strip() == "":
            continue

        parts = line.split(";")
        if len(parts) not in (5, 6):
            return {
                "error": (
                    "Invalid line format. Should have the format "
                    f"'{LINE_FORMAT}'."
                    f"(error found in line: {line})"
                )
            }, 400

        char = parts[0]
        pinyin = parts[1]
        tone = parts[2]
        writting_known = parts[3] == "true"
        word_strings = [word.strip() for word in parts[4].split(",") if word.strip()]
        try:
            updated_at = _parse_updated_at(parts[5]) if len(parts) == 6 else None
        except ValueError as exc:
            return {"error": f"{exc} (error found in line: {line})"}, 400

        char_record = Character.query.filter_by(user_id=user_id, char=char).first()
        if char_record is None:
            char_kwargs = {
                "user_id": user_id,
                "char": char,
                "pinyin": pinyin + tone,
                "writting_known": writting_known,
            }
            if updated_at is not None:
                char_kwargs["updated_at"] = updated_at
            char_record = Character(**char_kwargs)
            db.session.add(char_record)
        elif updated_at is not None:
            char_record.updated_at = updated_at

        for word_str in word_strings:
            word_record = Word.query.filter_by(user_id=user_id, word=word_str).first()
            if word_record is None:
                word_record = Word(user_id=user_id, word=word_str, definition="")
                db.session.add(word_record)

            now = updated_at if updated_at is not None else utcnow()
            char_record.updated_at = now
            word_record.updated_at = now

    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {"message": "File received"}, 200
