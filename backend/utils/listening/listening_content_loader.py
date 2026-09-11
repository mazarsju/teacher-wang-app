"""Loads listening-practice topics from the grammar-content S3 bucket.

Layout: ``listening_practice/hsk<level>/<name>/overview.yaml`` plus a
sibling ``text.txt`` (the transcript ``audio.mp3`` was recorded from). Each
``overview.yaml`` has ``id``, ``title``, ``hskLevel``, and ``grammarIds`` (a
list of ``grammar_points.id`` values this topic covers). This reuses the same
``GRAMMAR_CONTENT_S3_BUCKET``/``GRAMMAR_CONTENT_S3_PATH`` selection as
``grammar_content_loader.py`` — listening content lives in the same bucket,
under its own prefix, rather than a dedicated bucket.

Set ``GRAMMAR_CONTENT_S3_PATH`` to a local checkout (e.g. this repo's own
``s3/`` fixture tree) to reload from disk instead of S3, for local debugging.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

from backend.utils.database.extensions import db
from backend.utils.database.models import (
    GrammarPoint,
    ListeningPractice,
    ListeningProgress,
)
from backend.utils.grammar.grammar_content_loader import (
    _bucket,
    _load_manifests,
    _load_manifests_from_local,
    _read_local_file,
    _read_s3_object,
    _s3_client,
)

LISTENING_PRACTICE_PREFIX = "listening_practice/"
LISTENING_PRACTICE_MANIFEST_SUFFIX = "/overview.yaml"
LISTENING_PRACTICE_MANIFEST_FILENAME = "overview.yaml"
LISTENING_PRACTICE_TEXT_FILENAME = "text.txt"
_CJK_RE = re.compile(r"[一-鿿]")


def _unique_chars(text: str) -> str:
    """Every unique CJK character in ``text``, concatenated in first-seen order."""
    seen: dict[str, None] = {}
    for char in _CJK_RE.findall(text):
        seen.setdefault(char, None)
    return "".join(seen)


def reload_listening_content(client=None) -> dict[str, int]:
    """Clear and repopulate listening_practice from listening_practice/*/overview.yaml.

    Grammar ids in each topic's ``grammarIds`` are validated against
    ``grammar_points`` already in the database — this does not itself reload
    grammar content, so ``POST /admin/grammar/reload`` must have run at least
    once first. Rows in ``listening_progress`` for a topic that still exists
    after reload are kept; others are discarded, same as the writing/grammar
    reload's handling of their own progress tables.
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        root: Path | None = Path(local_path)
        bucket = None
        all_manifests = _load_manifests_from_local(
            root, LISTENING_PRACTICE_MANIFEST_FILENAME
        )
    else:
        root = None
        bucket = _bucket()
        client = client or _s3_client()
        all_manifests = _load_manifests(
            client, bucket, LISTENING_PRACTICE_MANIFEST_SUFFIX
        )

    # _load_manifests matches by suffix across the whole bucket/checkout, not
    # scoped to a folder prefix — scope to listening_practice/ so this
    # doesn't also pick up writing_practice's overview.yaml files (same
    # suffix, different schema) sharing the same bucket.
    manifests = {
        folder_key: manifest
        for folder_key, manifest in all_manifests.items()
        if folder_key.startswith(LISTENING_PRACTICE_PREFIX)
    }

    valid_grammar_ids = {row.id for row in GrammarPoint.query.all()}

    def _read_text(folder_key: str) -> str:
        relative_path = f"{folder_key}/{LISTENING_PRACTICE_TEXT_FILENAME}"
        if root is not None:
            return _read_local_file(root, relative_path) or ""
        return _read_s3_object(client, bucket, relative_path) or ""

    topics = []
    ids_seen: set[str] = set()
    for folder_key, manifest in manifests.items():
        topic_id = manifest.get("id")
        if not topic_id:
            raise ValueError(f"Missing 'id' in overview.yaml for {folder_key!r}")
        if topic_id in ids_seen:
            raise ValueError(
                f"Duplicate listening practice id {topic_id!r} ({folder_key!r})"
            )
        ids_seen.add(topic_id)

        title = manifest.get("title")
        if not title:
            raise ValueError(f"Missing 'title' in overview.yaml for {folder_key!r}")

        hsk_level = manifest.get("hskLevel")
        if not hsk_level:
            raise ValueError(f"Missing 'hskLevel' in overview.yaml for {folder_key!r}")

        grammar_ids = manifest.get("grammarIds") or []
        for grammar_id in grammar_ids:
            if grammar_id not in valid_grammar_ids:
                raise ValueError(
                    f"Unknown grammarId {grammar_id!r} for {folder_key!r}"
                )

        topics.append(
            {
                "id": topic_id,
                "title": title,
                "hsk_level": hsk_level,
                "grammar_rules": ",".join(grammar_ids),
                "unique_chars": _unique_chars(_read_text(folder_key)),
            }
        )

    kept_progress = [
        {
            "user_id": row.user_id,
            "listening_topic": row.listening_topic,
            "vocabulary_score": row.vocabulary_score,
            "grammar_score": row.grammar_score,
            "status": row.status,
        }
        for row in ListeningProgress.query.all()
    ]
    ListeningProgress.query.delete()
    ListeningPractice.query.delete()

    for topic in topics:
        db.session.execute(insert(ListeningPractice).values(**topic))

    to_restore = [row for row in kept_progress if row["listening_topic"] in ids_seen]
    if to_restore:
        db.session.execute(insert(ListeningProgress), to_restore)

    db.session.commit()
    return {"listening_practice": len(topics)}
