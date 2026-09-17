"""Loads grammar rules from the grammar-content S3 bucket.

Layout (see the teacher-wang-grammar repo's README):
``hsk<level>/<rule_nb>-<rule_name>/grammar.yaml`` plus sibling
``explanation.md``/``exercises/``/``images/`` files. Each ``grammar.yaml`` has
``id``, ``hsk_level``, ``title``, and an optional ``prerequisites`` list of
other rules' ``id`` values (e.g. ``hsk1_basic_sentence_structure`` — see that
repo's AGENTS.md for the exact syntax), not folder paths or titles. This
``id`` field is also ``grammar_points.id``, the primary key used throughout
the backend and API. ``grammar_points.index`` is ``curriculum_index(s3_key)``
(the folder's own numeric prefix, e.g. ``hsk1/01-foo`` -> 1) — curriculum
display order, stored on the row so callers don't recompute it from
``s3_key`` on every read.

The same bucket also has ``writing_practice/<name>/overview.yaml`` (plus a
sibling ``context.md``, not read here), each with ``id``, ``title``, and
``afterGrammarId`` — a ``grammar_points.id`` this writing topic follows in
the curriculum. These populate ``writing_practice``.

Non-English content lives in per-language siblings: ``explanation_<language>.md``,
``exercises_<language>.json``, ``grammar_<language>.yaml`` (translated
``title``), ``overview_<language>.yaml`` (translated ``title``), and
``context_<language>.md`` (translated writing-practice context) — e.g.
``explanation_fr.md``. A missing translation falls back to the English file.

``reload_grammar_content`` also caches every ``grammar_<language>.yaml``
title it finds (for each code in ``TRANSLATABLE_LANGUAGES``, i.e.
``behavior_spec.LANGUAGE_NAMES`` minus ``"en"``) into ``grammar_points_translate``,
keyed by ``grammar_points.id``. This is a cache of the same manifest siblings
``fetch_grammar_titles`` reads live — not a separate translation source — so
it only reflects whatever's authored in S3 as of the last reload.
``GET /grammar-points-light`` (the catalog list) reads this DB cache instead
of calling ``fetch_grammar_titles`` itself; only the detail route
(``GET /grammar-points/<id>``) still does a live per-request S3 read, since
it also needs untranslatable per-point content (explanation, exercises)
that isn't cached.

Set ``GRAMMAR_CONTENT_S3_PATH`` to a local checkout of that layout (e.g. a
`teacher-wang-grammar` clone's ``grammar/`` folder) to reload from disk
instead of S3, for local debugging.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import yaml
from botocore.exceptions import ClientError
from sqlalchemy.dialects.postgresql import insert

from backend.utils.aiChat.behavior_spec import LANGUAGE_NAMES
from backend.utils.database.extensions import db
from backend.utils.database.models import (
    GrammarPoint,
    GrammarPointTranslation,
    GrammarPrerequisite,
    UserGrammarProgress,
    WritingPractice,
    WritingProgress,
)

TRANSLATABLE_LANGUAGES = [code for code in LANGUAGE_NAMES if code != "en"]

GRAMMAR_MANIFEST_SUFFIX = "/grammar.yaml"
GRAMMAR_MANIFEST_FILENAME = "grammar.yaml"
WRITING_PRACTICE_MANIFEST_SUFFIX = "/overview.yaml"
WRITING_PRACTICE_MANIFEST_FILENAME = "overview.yaml"
_FOLDER_INDEX_RE = re.compile(r"^(\d+)")


def _grammar_point_id(hsk_level: int, title: str) -> str:
    return f"{hsk_level}|{title}"


def curriculum_index(s3_key: str | None) -> int:
    """Numeric prefix of the rule folder, e.g. ``hsk1/01-foo`` → 1.

    Curriculum order is the folder name, not the human title (see the grammar
    content ADR). Folders without a leading index sort as 0.
    """
    if not s3_key:
        return 0
    folder = s3_key.rstrip("/").rsplit("/", 1)[-1]
    match = _FOLDER_INDEX_RE.match(folder)
    return int(match.group(1)) if match else 0


def _s3_client():
    import boto3

    region = (
        os.environ.get("GRAMMAR_CONTENT_S3_REGION", "").strip()
        or os.environ.get("AWS_REGION", "").strip()
    )
    return boto3.client("s3", **({"region_name": region} if region else {}))


def _bucket() -> str:
    bucket = os.environ.get("GRAMMAR_CONTENT_S3_BUCKET", "").strip()
    if not bucket:
        raise ValueError(
            "GRAMMAR_CONTENT_S3_BUCKET is required to reload grammar rules"
        )
    return bucket


def _load_manifests(client, bucket: str, suffix: str) -> dict[str, dict]:
    """Maps each item's folder key to its parsed manifest YAML.

    ``suffix`` picks which manifest kind to collect (e.g. ``/grammar.yaml``
    or ``/overview.yaml``) out of the bucket's single object listing.
    """
    manifests: dict[str, dict] = {}
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for item in page.get("Contents", []) or []:
            key = item.get("Key", "")
            if not key.endswith(suffix):
                continue
            folder_key = key[: -len(suffix)]
            body = client.get_object(Bucket=bucket, Key=key)["Body"].read()
            manifests[folder_key] = yaml.safe_load(body) or {}
    return manifests


def _load_manifests_from_local(root: Path, filename: str) -> dict[str, dict]:
    """Same as _load_manifests, but walks a local grammar-content checkout."""
    manifests: dict[str, dict] = {}
    for manifest_path in root.rglob(filename):
        folder_key = manifest_path.parent.relative_to(root).as_posix()
        manifests[folder_key] = yaml.safe_load(manifest_path.read_text()) or {}
    return manifests


def reload_grammar_content(client=None) -> dict[str, int]:
    """Clear and repopulate grammar_points/grammar_prerequisites/writing_practice.

    Reads from GRAMMAR_CONTENT_S3_PATH (a local grammar-content checkout) when
    set, so grammar.yaml/overview.yaml changes can be tested without S3.
    Otherwise reads from the GRAMMAR_CONTENT_S3_BUCKET bucket.

    ``grammar_points.id`` is grammar.yaml's own ``id`` (e.g.
    ``hsk1_basic_sentence_structure``). Older rows — from before that field
    was the primary key — used ``"<hsk_level>|<title>"`` (e.g.
    ``"1|Basic Sentence Structure"``); ``user_grammar_progress`` rows still on
    that old id are matched to the point with the same hsk_level+title and
    rewritten onto the new id, so no progress is lost during the transition.
    Rows for points that were dropped or renamed are discarded.

    Also repopulates ``grammar_points_translate`` from each language's
    ``grammar_<language>.yaml`` siblings (``ON DELETE CASCADE`` from
    ``grammar_points`` clears the old rows for free when this function wipes
    and reinserts the parent table).
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        root = Path(local_path)
        manifests = _load_manifests_from_local(root, GRAMMAR_MANIFEST_FILENAME)
        writing_practice_manifests = _load_manifests_from_local(
            root, WRITING_PRACTICE_MANIFEST_FILENAME
        )
    else:
        bucket = _bucket()
        client = client or _s3_client()
        manifests = _load_manifests(client, bucket, GRAMMAR_MANIFEST_SUFFIX)
        writing_practice_manifests = _load_manifests(
            client, bucket, WRITING_PRACTICE_MANIFEST_SUFFIX
        )

    # _load_manifests matches by suffix across the whole bucket/checkout, not
    # scoped to a folder prefix — the bucket also holds
    # listening_practice/*/overview.yaml (same suffix, different schema), so
    # this must be filtered to writing_practice/ or those would be picked up
    # too and fail on the missing 'afterGrammarId' field.
    writing_practice_manifests = {
        folder_key: manifest
        for folder_key, manifest in writing_practice_manifests.items()
        if folder_key.startswith("writing_practice/")
    }

    ids_by_folder: dict[str, str] = {}
    old_id_by_folder: dict[str, str] = {}
    for folder_key, manifest in manifests.items():
        yaml_id = manifest.get("id")
        if not yaml_id:
            raise ValueError(f"Missing 'id' in grammar.yaml for {folder_key!r}")
        if yaml_id in ids_by_folder.values():
            raise ValueError(f"Duplicate grammar id {yaml_id!r} ({folder_key!r})")
        ids_by_folder[folder_key] = yaml_id
        old_id_by_folder[folder_key] = _grammar_point_id(
            manifest["hsk_level"], manifest["title"]
        )

    new_id_by_old_id = {
        old_id_by_folder[folder_key]: ids_by_folder[folder_key]
        for folder_key in manifests
    }

    kept_progress = [
        {
            "user_id": row.user_id,
            "grammar_id": row.grammar_id,
            "status": row.status,
            "score": row.score,
            "last_practiced_at": row.last_practiced_at,
            "usage_in_real_life": row.usage_in_real_life,
        }
        for row in UserGrammarProgress.query.all()
    ]
    kept_writing_progress = [
        {"user_id": row.user_id, "writing_topic": row.writing_topic, "status": row.status}
        for row in WritingProgress.query.all()
    ]
    UserGrammarProgress.query.delete()
    WritingProgress.query.delete()
    WritingPractice.query.delete()
    GrammarPrerequisite.query.delete()
    GrammarPoint.query.delete()

    for folder_key, manifest in manifests.items():
        db.session.execute(
            insert(GrammarPoint).values(
                id=ids_by_folder[folder_key],
                hsk_level=manifest["hsk_level"],
                title=manifest["title"],
                s3_key=folder_key,
                new_words=manifest.get("new_words"),
                index=curriculum_index(folder_key),
            )
        )

    translation_count = 0
    for language in TRANSLATABLE_LANGUAGES:
        titles = fetch_grammar_titles(language, client)
        for folder_key, title in titles.items():
            if folder_key not in ids_by_folder:
                continue
            db.session.execute(
                insert(GrammarPointTranslation).values(
                    point_id=ids_by_folder[folder_key],
                    language=language,
                    translate=title,
                )
            )
            translation_count += 1

    valid_ids = set(ids_by_folder.values())
    prerequisite_count = 0
    for folder_key, manifest in manifests.items():
        for prerequisite_id in manifest.get("prerequisites") or []:
            if prerequisite_id not in valid_ids:
                raise ValueError(
                    f"Unknown prerequisite {prerequisite_id!r} for {folder_key!r}"
                )
            db.session.execute(
                insert(GrammarPrerequisite).values(
                    grammar_id=ids_by_folder[folder_key],
                    prerequisite_id=prerequisite_id,
                )
            )
            prerequisite_count += 1

    practice_ids_seen: set[str] = set()
    for folder_key, manifest in writing_practice_manifests.items():
        practice_id = manifest.get("id")
        if not practice_id:
            raise ValueError(f"Missing 'id' in overview.yaml for {folder_key!r}")
        if practice_id in practice_ids_seen:
            raise ValueError(
                f"Duplicate writing practice id {practice_id!r} ({folder_key!r})"
            )
        practice_ids_seen.add(practice_id)

        title = manifest.get("title")
        if not title:
            raise ValueError(f"Missing 'title' in overview.yaml for {folder_key!r}")

        after_grammar_point = manifest.get("afterGrammarId")
        if not after_grammar_point:
            raise ValueError(
                f"Missing 'afterGrammarId' in overview.yaml for {folder_key!r}"
            )
        if after_grammar_point not in valid_ids:
            raise ValueError(
                f"Unknown afterGrammarId {after_grammar_point!r} for {folder_key!r}"
            )

        db.session.execute(
            insert(WritingPractice).values(
                id=practice_id,
                title=title,
                after_grammar_point=after_grammar_point,
            )
        )

    to_restore = []
    for row in kept_progress:
        grammar_id = row["grammar_id"]
        if grammar_id in valid_ids:
            to_restore.append(row)
        elif grammar_id in new_id_by_old_id:
            to_restore.append({**row, "grammar_id": new_id_by_old_id[grammar_id]})
    if to_restore:
        db.session.execute(insert(UserGrammarProgress), to_restore)

    writing_progress_to_restore = [
        row for row in kept_writing_progress if row["writing_topic"] in practice_ids_seen
    ]
    if writing_progress_to_restore:
        db.session.execute(insert(WritingProgress), writing_progress_to_restore)

    db.session.commit()
    return {
        "grammar_points": len(manifests),
        "grammar_prerequisites": prerequisite_count,
        "writing_practice": len(writing_practice_manifests),
        "grammar_points_translate": translation_count,
    }


def _read_local_file(root: Path, relative_path: str) -> str | None:
    path = root / relative_path
    return path.read_text() if path.exists() else None


def _read_s3_object(client, bucket: str, key: str) -> str | None:
    try:
        return client.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return None
        raise


def list_grammar_manifests(hsk_level: int | None = None) -> dict[str, dict]:
    """Maps folder key -> parsed grammar.yaml, optionally filtered to one HSK level.

    Reads from GRAMMAR_CONTENT_S3_PATH when set, otherwise GRAMMAR_CONTENT_S3_BUCKET
    — same source selection as reload_grammar_content, but skips the database
    entirely (used by scripts that just need the content, e.g. static page export).
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        manifests = _load_manifests_from_local(Path(local_path), GRAMMAR_MANIFEST_FILENAME)
    else:
        bucket = _bucket()
        manifests = _load_manifests(_s3_client(), bucket, GRAMMAR_MANIFEST_SUFFIX)

    if hsk_level is None:
        return manifests
    return {
        folder_key: manifest
        for folder_key, manifest in manifests.items()
        if manifest.get("hsk_level") == hsk_level
    }


def list_writing_practice_manifests() -> dict[str, dict]:
    """Maps folder key -> parsed overview.yaml for every writing-practice topic.

    Same source selection as list_grammar_manifests (GRAMMAR_CONTENT_S3_PATH or
    GRAMMAR_CONTENT_S3_BUCKET), no database involved.
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        return _load_manifests_from_local(Path(local_path), WRITING_PRACTICE_MANIFEST_FILENAME)
    return _load_manifests(_s3_client(), _bucket(), WRITING_PRACTICE_MANIFEST_SUFFIX)


def fetch_grammar_content(s3_key: str, language: str = "en", client=None) -> dict:
    """Fetches a grammar point's explanation and exercises for ``language``.

    English reads ``explanation.md``/``exercises.json``; any other language
    reads the translated ``explanation_<language>.md``/``exercises_<language>.json``
    siblings instead (e.g. ``explanation_fr.md``). Reads from
    GRAMMAR_CONTENT_S3_PATH (a local grammar-content checkout) when set,
    otherwise from the GRAMMAR_CONTENT_S3_BUCKET bucket. A missing file
    returns None for that field rather than raising, since not every topic
    has exercises (or a translation) authored yet.
    """
    explanation_filename = (
        "explanation.md" if language == "en" else f"explanation_{language}.md"
    )
    exercises_filename = (
        "exercises.json" if language == "en" else f"exercises_{language}.json"
    )

    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        root = Path(local_path)
        explanation = _read_local_file(root, f"{s3_key}/{explanation_filename}")
        exercises_raw = _read_local_file(root, f"{s3_key}/{exercises_filename}")
    else:
        bucket = _bucket()
        client = client or _s3_client()
        explanation = _read_s3_object(client, bucket, f"{s3_key}/{explanation_filename}")
        exercises_raw = _read_s3_object(client, bucket, f"{s3_key}/{exercises_filename}")

    return {
        "explanation": explanation,
        "exercises": json.loads(exercises_raw) if exercises_raw else None,
    }


def fetch_grammar_titles(language: str, client=None) -> dict[str, str]:
    """Maps ``s3_key`` -> translated title from ``grammar_<language>.yaml`` siblings.

    English titles already live in ``grammar_points.title``, so this returns
    ``{}`` for ``language == "en"``. Folders without a translated manifest
    (or without a ``title`` field in it) are simply absent from the result —
    callers should fall back to the English title.
    """
    if language == "en":
        return {}
    filename = f"grammar_{language}.yaml"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        manifests = _load_manifests_from_local(Path(local_path), filename)
    else:
        bucket = _bucket()
        client = client or _s3_client()
        manifests = _load_manifests(client, bucket, f"/{filename}")
    return {
        folder_key: manifest["title"]
        for folder_key, manifest in manifests.items()
        if manifest.get("title")
    }


def fetch_writing_practice_titles(language: str, client=None) -> dict[str, str]:
    """Maps ``writing_practice.id`` -> translated title from ``overview_<language>.yaml``.

    Same fallback contract as ``fetch_grammar_titles``: ``{}`` for English,
    and topics without a translated title are absent from the result.
    """
    if language == "en":
        return {}
    filename = f"overview_{language}.yaml"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        manifests = _load_manifests_from_local(Path(local_path), filename)
    else:
        bucket = _bucket()
        client = client or _s3_client()
        manifests = _load_manifests(client, bucket, f"/{filename}")
    return {
        folder_key.rsplit("/", 1)[-1]: manifest["title"]
        for folder_key, manifest in manifests.items()
        if manifest.get("title")
    }


def fetch_writing_practice_content(
    practice_id: str, language: str = "en", client=None
) -> dict:
    """Fetches a writing-practice topic's context, translated for ``language``.

    Reads ``context_<language>.md`` first (e.g. ``context_fr.md``), falling
    back to the English ``context.md`` when ``language`` is ``"en"`` or that
    translation hasn't been authored yet. Reads from GRAMMAR_CONTENT_S3_PATH
    (a local grammar-content checkout) when set, otherwise from the
    GRAMMAR_CONTENT_S3_BUCKET bucket. Assumes the topic's S3 folder name is
    its own id (``writing_practice/<id>/``), true of every topic authored so
    far — unlike grammar points, writing practice has no separate ``s3_key``
    column to look up instead. A missing file returns None rather than
    raising.
    """
    folder = f"writing_practice/{practice_id}"
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if not local_path:
        bucket = _bucket()
        client = client or _s3_client()

    def _read(filename: str) -> str | None:
        if local_path:
            return _read_local_file(Path(local_path), f"{folder}/{filename}")
        return _read_s3_object(client, bucket, f"{folder}/{filename}")

    context = _read(f"context_{language}.md") if language != "en" else None
    if context is None:
        context = _read("context.md")

    return {"context": context}
