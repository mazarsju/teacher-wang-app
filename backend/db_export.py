import os
from pathlib import Path

from backend.models import Character

DB_EXPORT_FILENAME = "db.txt"
DB_EXPORT_PATH = Path(
    os.environ.get(
        "DB_EXPORT_PATH",
        Path(__file__).resolve().parent.parent / DB_EXPORT_FILENAME,
    )
)

VALID_TONES = {"1", "2", "3", "4"}


def split_pinyin(pinyin: str) -> tuple[str, str]:
    if pinyin and pinyin[-1] in VALID_TONES:
        return pinyin[:-1], pinyin[-1]
    return pinyin, ""


def format_character_line(character: Character) -> str:
    pinyin_base, tone = split_pinyin(character.pinyin)
    writting_known = "true" if character.writting_known else "false"
    words_part = ", ".join(word.word for word in character.words)
    updated_at = character.updated_at.isoformat()
    return (
        f"{character.char};{pinyin_base};{tone};{writting_known};"
        f"{words_part};{updated_at}"
    )


def serialize_database(characters: list[Character]) -> str:
    lines = [format_character_line(character) for character in characters]
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def export_database_to_file(user_id: str, path: Path | None = None) -> Path:
    export_path = path or DB_EXPORT_PATH
    characters = (
        Character.query.filter_by(user_id=user_id)
        .order_by(Character.pinyin, Character.char)
        .all()
    )
    export_path.write_text(serialize_database(characters), encoding="utf-8")
    return export_path
