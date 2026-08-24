"""Loads grammar rules from the grammar-content S3 bucket.

Layout (see the teacher-wang-grammar repo's README):
``hsk<level>/<rule_nb>-<rule_name>/grammar.yaml`` plus sibling
``explanation.md``/``exercises/``/``images/`` files. Each ``grammar.yaml`` has
``id``, ``hsk_level``, ``title``, and an optional ``prerequisites`` list of
other rules' ``id`` values (e.g. ``hsk1_basic_sentence_structure`` — see that
repo's AGENTS.md for the exact syntax), not folder paths or titles. This
``id`` field is also ``grammar_points.id``, the primary key used throughout
the backend and API.

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

from backend.utils.database.extensions import db
from backend.utils.database.models import GrammarPoint, GrammarPrerequisite, UserGrammarProgress

GRAMMAR_MANIFEST_SUFFIX = "/grammar.yaml"
GRAMMAR_MANIFEST_FILENAME = "grammar.yaml"
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


def _load_manifests(client, bucket: str) -> dict[str, dict]:
    """Maps each rule's folder key to its parsed grammar.yaml."""
    manifests: dict[str, dict] = {}
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for item in page.get("Contents", []) or []:
            key = item.get("Key", "")
            if not key.endswith(GRAMMAR_MANIFEST_SUFFIX):
                continue
            folder_key = key[: -len(GRAMMAR_MANIFEST_SUFFIX)]
            body = client.get_object(Bucket=bucket, Key=key)["Body"].read()
            manifests[folder_key] = yaml.safe_load(body) or {}
    return manifests


def _load_manifests_from_local(root: Path) -> dict[str, dict]:
    """Same as _load_manifests, but walks a local grammar-content checkout."""
    manifests: dict[str, dict] = {}
    for manifest_path in root.rglob(GRAMMAR_MANIFEST_FILENAME):
        folder_key = manifest_path.parent.relative_to(root).as_posix()
        manifests[folder_key] = yaml.safe_load(manifest_path.read_text()) or {}
    return manifests


def reload_grammar_content(client=None) -> dict[str, int]:
    """Clear and repopulate grammar_points/grammar_prerequisites.

    Reads from GRAMMAR_CONTENT_S3_PATH (a local grammar-content checkout) when
    set, so grammar.yaml changes can be tested without S3. Otherwise reads
    from the GRAMMAR_CONTENT_S3_BUCKET bucket.

    ``grammar_points.id`` is grammar.yaml's own ``id`` (e.g.
    ``hsk1_basic_sentence_structure``). Older rows — from before that field
    was the primary key — used ``"<hsk_level>|<title>"`` (e.g.
    ``"1|Basic Sentence Structure"``); ``user_grammar_progress`` rows still on
    that old id are matched to the point with the same hsk_level+title and
    rewritten onto the new id, so no progress is lost during the transition.
    Rows for points that were dropped or renamed are discarded.
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        manifests = _load_manifests_from_local(Path(local_path))
    else:
        bucket = _bucket()
        client = client or _s3_client()
        manifests = _load_manifests(client, bucket)

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
        }
        for row in UserGrammarProgress.query.all()
    ]
    UserGrammarProgress.query.delete()
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
            )
        )

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

    to_restore = []
    for row in kept_progress:
        grammar_id = row["grammar_id"]
        if grammar_id in valid_ids:
            to_restore.append(row)
        elif grammar_id in new_id_by_old_id:
            to_restore.append({**row, "grammar_id": new_id_by_old_id[grammar_id]})
    if to_restore:
        db.session.execute(insert(UserGrammarProgress), to_restore)

    db.session.commit()
    return {
        "grammar_points": len(manifests),
        "grammar_prerequisites": prerequisite_count,
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


def fetch_grammar_content(s3_key: str, client=None) -> dict:
    """Fetches a grammar point's explanation.md and exercises.json.

    Reads from GRAMMAR_CONTENT_S3_PATH (a local grammar-content checkout)
    when set, otherwise from the GRAMMAR_CONTENT_S3_BUCKET bucket. A missing
    file returns None for that field rather than raising, since not every
    topic has exercises authored yet.
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        root = Path(local_path)
        explanation = _read_local_file(root, f"{s3_key}/explanation.md")
        exercises_raw = _read_local_file(root, f"{s3_key}/exercises.json")
    else:
        bucket = _bucket()
        client = client or _s3_client()
        explanation = _read_s3_object(client, bucket, f"{s3_key}/explanation.md")
        exercises_raw = _read_s3_object(client, bucket, f"{s3_key}/exercises.json")

    return {
        "explanation": explanation,
        "exercises": json.loads(exercises_raw) if exercises_raw else None,
    }
