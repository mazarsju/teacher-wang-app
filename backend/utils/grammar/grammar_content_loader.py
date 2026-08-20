"""Loads grammar rules from the grammar-content S3 bucket.

Layout (see the teacher-wang-grammar repo's README):
``hsk<level>/<rule_nb>-<rule_name>/grammar.yaml`` plus sibling
``explanation.md``/``exercises/``/``images/`` files. Each ``grammar.yaml`` has
``id``, ``hsk_level``, ``title``, and an optional ``prerequisites`` list of
other rules' ``id`` values (e.g. ``hsk1_basic_sentence_structure`` — see that
repo's AGENTS.md for the exact syntax), not folder paths or titles.

Set ``GRAMMAR_CONTENT_S3_PATH`` to a local checkout of that layout (e.g. a
`teacher-wang-grammar` clone's ``grammar/`` folder) to reload from disk
instead of S3, for local debugging.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from sqlalchemy.dialects.postgresql import insert

from backend.utils.database.extensions import db
from backend.utils.database.models import GrammarPoint, GrammarPrerequisite

GRAMMAR_MANIFEST_SUFFIX = "/grammar.yaml"
GRAMMAR_MANIFEST_FILENAME = "grammar.yaml"


def _grammar_point_id(hsk_level: int, title: str) -> str:
    return f"{hsk_level}|{title}"


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
    """
    local_path = os.environ.get("GRAMMAR_CONTENT_S3_PATH", "").strip()
    if local_path:
        manifests = _load_manifests_from_local(Path(local_path))
    else:
        bucket = _bucket()
        client = client or _s3_client()
        manifests = _load_manifests(client, bucket)

    ids_by_folder = {
        folder_key: _grammar_point_id(manifest["hsk_level"], manifest["title"])
        for folder_key, manifest in manifests.items()
    }

    # grammar.yaml's own `id` field (e.g. "hsk1_basic_sentence_structure") is
    # what `prerequisites` entries reference — not the folder key.
    db_id_by_yaml_id: dict[str, str] = {}
    for folder_key, manifest in manifests.items():
        yaml_id = manifest.get("id")
        if not yaml_id:
            raise ValueError(f"Missing 'id' in grammar.yaml for {folder_key!r}")
        if yaml_id in db_id_by_yaml_id:
            raise ValueError(f"Duplicate grammar id {yaml_id!r} ({folder_key!r})")
        db_id_by_yaml_id[yaml_id] = ids_by_folder[folder_key]

    GrammarPrerequisite.query.delete()
    GrammarPoint.query.delete()

    for folder_key, manifest in manifests.items():
        db.session.execute(
            insert(GrammarPoint).values(
                id=ids_by_folder[folder_key],
                hsk_level=manifest["hsk_level"],
                title=manifest["title"],
                s3_key=folder_key,
            )
        )

    prerequisite_count = 0
    for folder_key, manifest in manifests.items():
        for prerequisite_id in manifest.get("prerequisites") or []:
            if prerequisite_id not in db_id_by_yaml_id:
                raise ValueError(
                    f"Unknown prerequisite {prerequisite_id!r} for {folder_key!r}"
                )
            db.session.execute(
                insert(GrammarPrerequisite).values(
                    grammar_id=ids_by_folder[folder_key],
                    prerequisite_id=db_id_by_yaml_id[prerequisite_id],
                )
            )
            prerequisite_count += 1

    db.session.commit()
    return {
        "grammar_points": len(manifests),
        "grammar_prerequisites": prerequisite_count,
    }
