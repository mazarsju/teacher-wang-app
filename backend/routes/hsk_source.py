"""HSK vocabulary source: download and group complete-hsk entries."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import NamedTuple
from urllib.request import urlopen

from backend.utils.knowledgeBase.pinyin import normalize_anki_pinyin_token

COMPLETE_HSK_JSON_URL = (
    "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json"
)
HSK_FALLBACK_PATH = Path(__file__).resolve().parents[1] / "hsk.json"
NEW_LEVEL_PATTERN = re.compile(r"^new-(\d+)$")
# Neutral tone in complete-hsk numeric pinyin; app syllables use no digit instead.
_NEUTRAL_TONE = "5"

logger = logging.getLogger(__name__)


class HskWordForm(NamedTuple):
    """One HSK word reading ready to insert into ``hsk_words``."""

    word: str
    frequency: int
    pinyin: str
    definition: str

    @property
    def id(self) -> str:
        return make_hsk_word_id(self.word, self.pinyin)


def make_hsk_word_id(word: str, pinyin: str) -> str:
    """Build the primary key from word + pinyin."""
    return f"{word}|{pinyin}"


def _correct_pinyin_syllable(syllable: str) -> str:
    """Fix known upstream pinyin syntax mistakes, keeping the original when unfixable."""
    return normalize_anki_pinyin_token(syllable) or syllable


def normalize_hsk_numeric_pinyin(numeric: str) -> str:
    """Normalize ``forms.transcriptions.numeric`` to app pinyin form.

    Lowercases each syllable, strips neutral tone ``5`` (app syllables use
    tones 1–4 or no digit), and corrects known upstream syntax mistakes
    (see ``_correct_pinyin_syllable``). Syllables stay space-separated for
    multi-character words.
    """
    syllables: list[str] = []
    for token in numeric.split():
        syllable = token.strip().lower()
        if not syllable:
            continue
        if syllable[-1] == _NEUTRAL_TONE:
            syllable = syllable[:-1]
        syllables.append(_correct_pinyin_syllable(syllable))
    return " ".join(syllables)


def definition_from_meanings(meanings: list[str] | None) -> str:
    """Join form meanings with `` | ``, matching complete-hsk multi-sense layout."""
    if not meanings:
        return ""
    return " | ".join(meanings)


def fetch_complete_hsk_entries(url: str = COMPLETE_HSK_JSON_URL) -> list[dict]:
    """Download and parse the upstream complete HSK vocabulary JSON."""
    with urlopen(url) as response:  # noqa: S310 - fixed trusted upstream URL
        return json.loads(response.read().decode("utf-8"))


def load_fallback_hsk_entries(path: Path = HSK_FALLBACK_PATH) -> list[dict]:
    """Load the bundled lightweight HSK JSON fallback."""
    return json.loads(path.read_text(encoding="utf-8"))


def load_complete_hsk_entries(source: str | Path | None = None) -> list[dict]:
    """Load entries from a local path, or download from GitHub when omitted.

    When downloading fails for any reason, falls back to ``backend/hsk.json``.
    """
    if source is not None:
        path = Path(source)
        return json.loads(path.read_text(encoding="utf-8"))

    try:
        return fetch_complete_hsk_entries()
    except Exception:
        logger.exception(
            "Failed to download %s; using fallback %s",
            COMPLETE_HSK_JSON_URL,
            HSK_FALLBACK_PATH,
        )
        return load_fallback_hsk_entries()


def _forms_from_entry(entry: dict, frequency: int) -> list[HskWordForm]:
    """Expand one complete-hsk entry into one ``HskWordForm`` per distinct pinyin.

    Forms that normalize to the same pinyin are merged: meanings are appended in
    source order (e.g. surname + verb senses for 离 / li2).

    Lightweight fallback entries without ``forms`` yield a single row with empty
    pinyin and definition.
    """
    word = entry["simplified"]
    forms = entry.get("forms") or []
    if not forms:
        return [HskWordForm(word=word, frequency=frequency, pinyin="", definition="")]

    # Preserve first-seen pinyin order; append meanings for duplicate readings.
    merged: dict[str, list[str]] = {}
    order: list[str] = []
    for form in forms:
        transcriptions = form.get("transcriptions") or {}
        numeric = transcriptions.get("numeric") or ""
        pinyin = normalize_hsk_numeric_pinyin(numeric)
        meanings = [m for m in (form.get("meanings") or []) if m]
        if pinyin not in merged:
            merged[pinyin] = []
            order.append(pinyin)
        merged[pinyin].extend(meanings)

    return [
        HskWordForm(
            word=word,
            frequency=frequency,
            pinyin=pinyin,
            definition=definition_from_meanings(merged[pinyin]),
        )
        for pinyin in order
    ]


def words_by_new_level(
    entries: list[dict],
) -> list[list[HskWordForm]]:
    """Group entries by ``new-1`` … ``new-7`` as form rows.

    Ignores ``old-X`` / ``newest-X`` labels. Each level list is sorted by
    frequency ascending, then word, then pinyin.
    """
    lists: list[list[HskWordForm]] = [[] for _ in range(7)]

    for entry in entries:
        frequency = int(entry["frequency"])
        form_rows = _forms_from_entry(entry, frequency)
        for level_label in entry.get("level", []):
            match = NEW_LEVEL_PATTERN.fullmatch(level_label)
            if match is None:
                continue
            level_number = int(match.group(1))
            if 1 <= level_number <= 7:
                lists[level_number - 1].extend(form_rows)

    for rows in lists:
        rows.sort(key=lambda row: (row.frequency, row.word, row.pinyin))

    return lists
