import csv
import io

from backend.models import Word

CSV_HEADER = ["word", "definition", "pinyin", "writting_known", "synchronized", "updated_at"]


def word_to_csv_row(word: Word) -> list[str]:
    return [
        word.word,
        word.definition or "",
        word.pinyin or "",
        "true" if word.writting_known else "false",
        "true" if word.anki_voc_sync else "false",
        word.updated_at.isoformat(),
    ]


def serialize_database(words: list[Word]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    for word in words:
        writer.writerow(word_to_csv_row(word))
    return buffer.getvalue()


def get_export_database_content(user_id: str) -> str:
    """Export the learner's words table as CSV."""
    words = Word.query.filter_by(user_id=user_id).order_by(Word.word).all()
    return serialize_database(words)
