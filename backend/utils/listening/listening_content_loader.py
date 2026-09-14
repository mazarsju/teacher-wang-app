"""Loads listening-practice topics from the grammar-content S3 bucket.

Layout: ``listening_practice/hsk<level>/<name>/overview.yaml`` plus a
sibling ``text.txt`` (the transcript ``audio.mp3`` was recorded from). Each
``overview.yaml`` has ``id``, ``title``, ``hskLevel``, ``type`` (e.g.
"dialog", "fiction_story"), ``topic`` (a short content slug, e.g. "family"),
and ``grammarIds`` (a list of ``grammar_points.id`` values this topic
covers). This reuses the same
``GRAMMAR_CONTENT_S3_BUCKET``/``GRAMMAR_CONTENT_S3_PATH`` selection as
``grammar_content_loader.py`` — listening content lives in the same bucket,
under its own prefix, rather than a dedicated bucket.

Non-English ``title``/``type``/``topic`` live in an ``overview_<language>.yaml``
sibling (e.g. ``overview_fr.yaml``), same convention as
``grammar_content_loader.py``'s ``overview_<language>.yaml`` for writing
practice. A missing translation, or a missing field within one, falls back
to the English row.

Set ``GRAMMAR_CONTENT_S3_PATH`` to a local checkout (e.g. this repo's own
``s3/`` fixture tree) to reload from disk instead of S3, for local debugging.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from botocore.exceptions import ClientError
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
LISTENING_PRACTICE_AUDIO_FILENAME = "audio.mp3"
LISTENING_PRACTICE_BREAKDOWN_FILENAME = "breakdown.json"
_CJK_RE = re.compile(r"[一-鿿]")
_AUDIO_SEGMENT_RE = re.compile(r"^audio-(\d+)\.mp3$")


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

        practice_type = manifest.get("type")
        if not practice_type:
            raise ValueError(f"Missing 'type' in overview.yaml for {folder_key!r}")

        topic = manifest.get("topic")
        if not topic:
            raise ValueError(f"Missing 'topic' in overview.yaml for {folder_key!r}")

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
                "type": practice_type,
                "topic": topic,
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


def fetch_listening_practice_translations(
    language: str, client=None
) -> dict[str, dict]:
    """Maps ``listening_practice.id`` -> translated ``{title, type, topic}``.

    Read from ``overview_<language>.yaml`` siblings, same fallback contract
    as ``fetch_writing_practice_titles``: ``{}`` for English, and a topic
    without a translated manifest (or missing a given field in it) simply
    omits that key — callers fall back to the English row.
    """
    if language == "en":
        return {}
    filename = f"overview_{language}.yaml"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        all_manifests = _load_manifests_from_local(Path(local_path), filename)
    else:
        bucket = _bucket()
        client = client or _s3_client()
        all_manifests = _load_manifests(client, bucket, f"/{filename}")

    manifests = {
        folder_key: manifest
        for folder_key, manifest in all_manifests.items()
        if folder_key.startswith(LISTENING_PRACTICE_PREFIX)
    }
    return {
        folder_key.rsplit("/", 1)[-1]: {
            field: manifest[field]
            for field in ("title", "type", "topic")
            if manifest.get(field)
        }
        for folder_key, manifest in manifests.items()
    }


def _topic_folder(hsk_level: int, topic_id: str) -> str:
    return f"listening_practice/hsk{hsk_level}/{topic_id}"


def _read_local_bytes(root: Path, relative_path: str) -> bytes | None:
    path = root / relative_path
    return path.read_bytes() if path.exists() else None


def _read_s3_bytes(client, bucket: str, key: str) -> bytes | None:
    try:
        return client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return None
        raise


def fetch_listening_text(hsk_level: int, topic_id: str, client=None) -> str | None:
    """The topic's full ``text.txt`` transcript, or None if missing."""
    relative_path = f"{_topic_folder(hsk_level, topic_id)}/{LISTENING_PRACTICE_TEXT_FILENAME}"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        return _read_local_file(Path(local_path), relative_path)
    bucket = _bucket()
    client = client or _s3_client()
    return _read_s3_object(client, bucket, relative_path)


def read_listening_audio(hsk_level: int, topic_id: str, client=None) -> bytes | None:
    """Raw bytes of the topic's full ``audio.mp3``, or None if missing."""
    relative_path = f"{_topic_folder(hsk_level, topic_id)}/{LISTENING_PRACTICE_AUDIO_FILENAME}"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        return _read_local_bytes(Path(local_path), relative_path)
    bucket = _bucket()
    client = client or _s3_client()
    return _read_s3_bytes(client, bucket, relative_path)


def list_listening_audio_segments(hsk_level: int, topic_id: str, client=None) -> list[int]:
    """Sorted segment numbers available under the topic's ``audio/`` folder.

    e.g. ``audio/audio-1.mp3``, ``audio/audio-2.mp3`` -> ``[1, 2]``.
    """
    audio_folder = f"{_topic_folder(hsk_level, topic_id)}/audio"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    filenames: list[str] = []
    if local_path:
        folder = Path(local_path) / audio_folder
        if folder.is_dir():
            filenames = [path.name for path in folder.iterdir()]
    else:
        bucket = _bucket()
        client = client or _s3_client()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=f"{audio_folder}/"):
            for item in page.get("Contents", []) or []:
                filenames.append(item.get("Key", "").rsplit("/", 1)[-1])

    numbers = []
    for filename in filenames:
        match = _AUDIO_SEGMENT_RE.match(filename)
        if match:
            numbers.append(int(match.group(1)))
    return sorted(numbers)


def read_listening_audio_segment(
    hsk_level: int, topic_id: str, segment: int, chunk: int | None = None, client=None
) -> bytes | None:
    """Raw bytes of one shadowing clip, or None if missing.

    ``audio/audio-<segment>.mp3`` when ``chunk`` is None; for a sentence
    broken into shadowing chunks (``breakdown.json``'s per-sentence
    ``chunks``), pass the chunk id to read ``audio/audio-<segment>-<chunk>.mp3``
    instead.
    """
    suffix = f"{segment}-{chunk}" if chunk is not None else f"{segment}"
    relative_path = f"{_topic_folder(hsk_level, topic_id)}/audio/audio-{suffix}.mp3"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        return _read_local_bytes(Path(local_path), relative_path)
    bucket = _bucket()
    client = client or _s3_client()
    return _read_s3_bytes(client, bucket, relative_path)


def fetch_listening_breakdown(
    hsk_level: int, topic_id: str, language: str = "en", client=None
) -> list[dict]:
    """Per-sentence breakdown: ``[{id, mandarin, translation, chunks}, ...]``.

    ``translation`` is ``breakdown.json``'s own ``english`` field for
    ``language == "en"``; for any other language it's read from the sibling
    ``breakdown_<language>.json`` (``{"sentences": [{"id", "translate"}]}``),
    falling back to English per-sentence when that file or a given sentence
    id is missing from it — same fallback contract as the rest of this
    module's translation siblings (``explanation_<language>.md`` etc.).

    ``chunks`` is ``[{id, mandarin}, ...]``, empty for a sentence short
    enough to shadow whole. Chunks are never translated separately — only
    the parent sentence carries a ``translation``.
    """
    folder = _topic_folder(hsk_level, topic_id)
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        root: Path | None = Path(local_path)
        bucket = None
    else:
        root = None
        bucket = _bucket()
        client = client or _s3_client()

    def _read_json(filename: str) -> dict | None:
        relative_path = f"{folder}/{filename}"
        raw = (
            _read_local_file(root, relative_path)
            if root is not None
            else _read_s3_object(client, bucket, relative_path)
        )
        return json.loads(raw) if raw else None

    base = _read_json(LISTENING_PRACTICE_BREAKDOWN_FILENAME) or {"sentences": []}
    translations_by_id: dict[int, str] = {}
    if language != "en":
        translated = _read_json(f"breakdown_{language}.json")
        if translated:
            translations_by_id = {
                entry["id"]: entry["translate"]
                for entry in translated.get("sentences", [])
            }

    return [
        {
            "id": sentence["id"],
            "mandarin": sentence["mandarin"],
            "translation": translations_by_id.get(
                sentence["id"], sentence.get("english", "")
            ),
            "chunks": [
                {"id": chunk["id"], "mandarin": chunk["mandarin"]}
                for chunk in sentence.get("chunks", [])
            ],
        }
        for sentence in base.get("sentences", [])
    ]


def fetch_listening_exercises(
    hsk_level: int, topic_id: str, language: str = "en", client=None
) -> list[dict]:
    """Comprehension exercises for a listening topic.

    ``[{id, type: "multiple_choice", question, choices, answer}, ...]`` plus
    a trailing ``{id, type: "open_question", question}`` entry — same shape
    as the grammar content pipeline's ``exercises.json``. The route layer
    (``get_listening_practice.py``) splits the ``open_question`` entry out
    into its own ``bonus_question`` field; this loader returns the raw list
    as-is. English reads ``exercises.json``; any other language reads the
    fully translated ``exercises_<language>.json`` sibling, falling back to
    the English file if that translation hasn't been authored yet.
    """
    folder = _topic_folder(hsk_level, topic_id)
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        root: Path | None = Path(local_path)
        bucket = None
    else:
        root = None
        bucket = _bucket()
        client = client or _s3_client()

    def _read(filename: str) -> str | None:
        relative_path = f"{folder}/{filename}"
        return (
            _read_local_file(root, relative_path)
            if root is not None
            else _read_s3_object(client, bucket, relative_path)
        )

    filename = (
        "exercises.json" if language == "en" else f"exercises_{language}.json"
    )
    raw = _read(filename)
    if raw is None and language != "en":
        raw = _read("exercises.json")
    return json.loads(raw) if raw else []
