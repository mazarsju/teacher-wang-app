"""Fully reload HSK words and characters from the upstream complete-hsk JSON."""

from __future__ import annotations

import sys
from pathlib import Path

from backend import create_app
from backend.utils.database.models import HskCharacter, HskWord
from backend.utils.knowledgeBase.hsk_content_loader import reload_hsk_content
from backend.utils.knowledgeBase.hsk_source import COMPLETE_HSK_JSON_URL, load_complete_hsk_entries


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else None
    if source is None:
        print(f"Downloading {COMPLETE_HSK_JSON_URL} …")
    else:
        print(f"Loading {source} …")

    entries = load_complete_hsk_entries(Path(source) if source else None)

    app = create_app()
    with app.app_context():
        counts = reload_hsk_content(entries)
        word_rows = HskWord.query.count()
        character_rows = HskCharacter.query.count()

    for label, count in counts.items():
        print(f"{label}: processed {count} words")
    print(f"hsk_words rows: {word_rows}")
    print(f"hsk_characters rows: {character_rows}")


if __name__ == "__main__":
    main()
