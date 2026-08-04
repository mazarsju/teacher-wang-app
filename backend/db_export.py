import os
from pathlib import Path

from backend.models import Character, Word

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


def words_for_character(user_id, char: str, words: list[Word] | None = None) -> list[Word]:
    """Return the learner's words that contain ``char`` (substring match)."""
    source = words
    if source is None:
        source = Word.query.filter_by(user_id=user_id).all()
    return [word for word in source if char in word.word]


def format_character_line(
    character: Character,
    words: list[Word] | None = None,
) -> str:
    pinyin_base, tone = split_pinyin(character.pinyin)
    writting_known = "true" if character.writting_known else "false"
    linked = words if words is not None else words_for_character(
        character.user_id, character.char
    )
    words_part = ", ".join(word.word for word in linked)
    updated_at = character.updated_at.isoformat()
    return (
        f"{character.char};{pinyin_base};{tone};{writting_known};"
        f"{words_part};{updated_at}"
    )


def serialize_database(
    characters: list[Character],
    words: list[Word] | None = None,
) -> str:
    lines = [
        format_character_line(
            character,
            words_for_character(character.user_id, character.char, words),
        )
        for character in characters
    ]
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
    words = Word.query.filter_by(user_id=user_id).order_by(Word.word).all()
    export_path.write_text(serialize_database(characters, words), encoding="utf-8")
    return export_path
