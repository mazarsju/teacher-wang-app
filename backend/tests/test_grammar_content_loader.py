import bootstrap  # noqa: F401
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from backend.utils.database.models import GrammarPoint, GrammarPrerequisite
from backend.utils.grammar.grammar_content_loader import (
    fetch_grammar_content,
    reload_grammar_content,
)
from postgres_test_case import PostgresTestCase


class _FakeBody:
    def __init__(self, text: str):
        self._text = text

    def read(self):
        return self._text.encode("utf-8")


def _make_client(objects: dict[str, str]) -> MagicMock:
    client = MagicMock()

    def get_object(*, Bucket, Key):
        return {"Body": _FakeBody(objects[Key])}

    def list_objects_v2(**kwargs):
        return {"Contents": [{"Key": key} for key in sorted(objects)]}

    client.get_object.side_effect = get_object
    client.get_paginator.return_value.paginate.side_effect = (
        lambda **kwargs: [list_objects_v2(**kwargs)]
    )
    return client


class TestReloadGrammarContent(PostgresTestCase):
    def setUp(self) -> None:
        super().setUp()
        # Isolate from a developer's local .env, which may set this for
        # local debugging (see test_reads_from_local_path_when_env_var_set).
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_loads_points_and_prerequisites(self):
        objects = {
            "hsk1/01-basic-sentence-structure/grammar.yaml": (
                "id: hsk1_basic_sentence_structure\n"
                "hsk_level: 1\ntitle: Basic sentence structure\n"
            ),
            "hsk1/01-basic-sentence-structure/explanation.md": "# not a manifest",
            "hsk1/02-negation/grammar.yaml": (
                "id: hsk1_negation_with_bu\n"
                "hsk_level: 1\n"
                "title: Negation with 不\n"
                "prerequisites:\n"
                "  - hsk1_basic_sentence_structure\n"
            ),
        }
        client = _make_client(objects)

        import os

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            counts = reload_grammar_content(client=client)
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(counts, {"grammar_points": 2, "grammar_prerequisites": 1})
        self.assertEqual(GrammarPoint.query.count(), 2)

        base = GrammarPoint.query.filter_by(title="Basic sentence structure").one()
        self.assertEqual(base.hsk_level, 1)
        self.assertEqual(base.s3_key, "hsk1/01-basic-sentence-structure")

        negation = GrammarPoint.query.filter_by(title="Negation with 不").one()
        prerequisite = GrammarPrerequisite.query.filter_by(
            grammar_id=negation.id
        ).one()
        self.assertEqual(prerequisite.prerequisite_id, base.id)

    def test_clears_existing_rows_before_reload(self):
        db_setup_objects = {
            "hsk1/01-basic-sentence-structure/grammar.yaml": (
                "id: hsk1_basic_sentence_structure\n"
                "hsk_level: 1\ntitle: Basic sentence structure\n"
            ),
        }
        from backend.utils.database.extensions import db

        db.session.add(GrammarPoint(id="stale", hsk_level=5, title="Stale rule"))
        db.session.commit()

        import os

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            reload_grammar_content(client=_make_client(db_setup_objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertIsNone(GrammarPoint.query.filter_by(id="stale").first())
        self.assertEqual(GrammarPoint.query.count(), 1)

    def test_raises_when_bucket_env_var_missing(self):
        import os

        os.environ.pop("GRAMMAR_CONTENT_S3_BUCKET", None)
        with self.assertRaises(ValueError):
            reload_grammar_content(client=MagicMock())

    def test_reads_from_local_path_when_env_var_set(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            rule_dir = root / "hsk1" / "01-basic-sentence-structure"
            rule_dir.mkdir(parents=True)
            (rule_dir / "grammar.yaml").write_text(
                "id: hsk1_basic_sentence_structure\n"
                "hsk_level: 1\ntitle: Basic sentence structure\n"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                counts = reload_grammar_content()
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(counts, {"grammar_points": 1, "grammar_prerequisites": 0})
        point = GrammarPoint.query.one()
        self.assertEqual(point.title, "Basic sentence structure")
        self.assertEqual(point.s3_key, "hsk1/01-basic-sentence-structure")

    def test_raises_on_unknown_prerequisite(self):
        objects = {
            "hsk1/02-negation/grammar.yaml": (
                "id: hsk1_negation_with_bu\n"
                "hsk_level: 1\n"
                "title: Negation with 不\n"
                "prerequisites:\n"
                "  - hsk1_does_not_exist\n"
            ),
        }
        import os

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            with self.assertRaises(ValueError):
                reload_grammar_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

    def test_raises_on_missing_id(self):
        objects = {
            "hsk1/01-basic-sentence-structure/grammar.yaml": (
                "hsk_level: 1\ntitle: Basic sentence structure\n"
            ),
        }
        import os

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            with self.assertRaises(ValueError):
                reload_grammar_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

    def test_raises_on_duplicate_id(self):
        objects = {
            "hsk1/01-basic-sentence-structure/grammar.yaml": (
                "id: hsk1_basic_sentence_structure\n"
                "hsk_level: 1\ntitle: Basic sentence structure\n"
            ),
            "hsk1/02-duplicate/grammar.yaml": (
                "id: hsk1_basic_sentence_structure\n"
                "hsk_level: 1\ntitle: Duplicate\n"
            ),
        }
        import os

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            with self.assertRaises(ValueError):
                reload_grammar_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]


class TestFetchGrammarContent(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_reads_from_local_path_when_env_var_set(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            rule_dir = root / "hsk1" / "01-basic-sentence-structure"
            rule_dir.mkdir(parents=True)
            (rule_dir / "explanation.md").write_text("# Basic sentence structure")
            (rule_dir / "exercises.json").write_text('[{"id": "mcq_001"}]')

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                content = fetch_grammar_content("hsk1/01-basic-sentence-structure")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(content["explanation"], "# Basic sentence structure")
        self.assertEqual(content["exercises"], [{"id": "mcq_001"}])

    def test_local_path_missing_files_return_none(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = temp_dir
            try:
                content = fetch_grammar_content("hsk1/01-basic-sentence-structure")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertIsNone(content["explanation"])
        self.assertIsNone(content["exercises"])

    def test_reads_from_s3_when_local_path_not_set(self):
        client = _make_client(
            {
                "hsk1/01-basic-sentence-structure/explanation.md": "# Basic sentence structure",
                "hsk1/01-basic-sentence-structure/exercises.json": '[{"id": "mcq_001"}]',
            }
        )

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            content = fetch_grammar_content(
                "hsk1/01-basic-sentence-structure", client=client
            )
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(content["explanation"], "# Basic sentence structure")
        self.assertEqual(content["exercises"], [{"id": "mcq_001"}])

    def test_s3_missing_key_returns_none(self):
        client = MagicMock()
        client.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey"}}, "GetObject"
        )

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            content = fetch_grammar_content(
                "hsk1/01-basic-sentence-structure", client=client
            )
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertIsNone(content["explanation"])
        self.assertIsNone(content["exercises"])


if __name__ == "__main__":
    unittest.main()
