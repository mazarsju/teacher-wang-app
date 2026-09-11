import bootstrap  # noqa: F401
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from backend.utils.database.extensions import db
from backend.utils.database.models import (
    GrammarPoint,
    ListeningPractice,
    ListeningProgress,
)
from backend.utils.listening.listening_content_loader import (
    _unique_chars,
    reload_listening_content,
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
        if Key not in objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": _FakeBody(objects[Key])}

    def list_objects_v2(**kwargs):
        return {"Contents": [{"Key": key} for key in sorted(objects)]}

    client.get_object.side_effect = get_object
    client.get_paginator.return_value.paginate.side_effect = (
        lambda **kwargs: [list_objects_v2(**kwargs)]
    )
    return client


class TestUniqueChars(unittest.TestCase):
    def test_dedupes_preserving_first_occurrence_order(self):
        self.assertEqual(_unique_chars("你好你好"), "你好")

    def test_ignores_punctuation_and_latin_text(self):
        self.assertEqual(_unique_chars("你好，world！你"), "你好")

    def test_empty_text_is_empty(self):
        self.assertEqual(_unique_chars(""), "")


class TestReloadListeningContent(PostgresTestCase):
    def setUp(self) -> None:
        super().setUp()
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)
        db.session.add(
            GrammarPoint(
                id="hsk1_basic_sentence_structure",
                hsk_level=1,
                title="Basic sentence structure",
            )
        )
        db.session.commit()

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_loads_topic_with_grammar_rules_and_unique_chars(self):
        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\n"
                "title: How many are in your family?\n"
                "hskLevel: 1\n"
                "grammarIds:\n"
                "  - hsk1_basic_sentence_structure\n"
            ),
            "listening_practice/hsk1/listening-family-size/text.txt": "你好你好！",
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            counts = reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(counts, {"listening_practice": 1})
        topic = ListeningPractice.query.one()
        self.assertEqual(topic.id, "listening-family-size")
        self.assertEqual(topic.title, "How many are in your family?")
        self.assertEqual(topic.hsk_level, 1)
        self.assertEqual(topic.grammar_rules, "hsk1_basic_sentence_structure")
        self.assertEqual(topic.unique_chars, "你好")

    def test_ignores_writing_practice_overview_files_in_same_bucket(self):
        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
            ),
            "listening_practice/hsk1/listening-family-size/text.txt": "你好",
            "writing_practice/writing-present-yourself/overview.yaml": (
                "id: writing-present-yourself\n"
                "title: Present yourself\n"
                "afterGrammarId: hsk1_basic_sentence_structure\n"
            ),
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            counts = reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(counts, {"listening_practice": 1})

    def test_clears_existing_rows_before_reload(self):
        db.session.add(
            ListeningPractice(id="stale", title="Stale", hsk_level=1)
        )
        db.session.commit()

        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
            ),
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertIsNone(ListeningPractice.query.filter_by(id="stale").first())
        self.assertEqual(ListeningPractice.query.count(), 1)

    def test_raises_on_missing_id(self):
        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "title: Family size\nhskLevel: 1\n"
            ),
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            with self.assertRaises(ValueError):
                reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

    def test_raises_on_duplicate_id(self):
        objects = {
            "listening_practice/hsk1/a/overview.yaml": (
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
            ),
            "listening_practice/hsk1/b/overview.yaml": (
                "id: listening-family-size\ntitle: Duplicate\nhskLevel: 1\n"
            ),
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            with self.assertRaises(ValueError):
                reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

    def test_raises_on_unknown_grammar_id(self):
        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\n"
                "title: Family size\n"
                "hskLevel: 1\n"
                "grammarIds:\n  - hsk1_does_not_exist\n"
            ),
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            with self.assertRaises(ValueError):
                reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

    def test_reads_from_local_path_when_env_var_set(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "overview.yaml").write_text(
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
            )
            (topic_dir / "text.txt").write_text("你好")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                counts = reload_listening_content()
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(counts, {"listening_practice": 1})
        topic = ListeningPractice.query.one()
        self.assertEqual(topic.unique_chars, "你好")

    def test_keeps_progress_for_still_valid_topics(self):
        db.session.add(
            ListeningPractice(id="listening-family-size", title="Family size", hsk_level=1)
        )
        db.session.commit()
        db.session.add(
            ListeningProgress(
                user_id=self.user_id,
                listening_topic="listening-family-size",
                vocabulary_score=80,
                grammar_score=90,
                status="DONE",
            )
        )
        db.session.commit()

        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
            ),
        }
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        kept = ListeningProgress.query.filter_by(
            user_id=self.user_id, listening_topic="listening-family-size"
        ).one()
        self.assertEqual(kept.status, "DONE")
        self.assertEqual(kept.vocabulary_score, 80)

    def test_drops_progress_for_removed_topics(self):
        db.session.add(
            ListeningPractice(id="listening-stale", title="Stale", hsk_level=1)
        )
        db.session.commit()
        db.session.add(
            ListeningProgress(
                user_id=self.user_id,
                listening_topic="listening-stale",
                status="DONE",
            )
        )
        db.session.commit()

        objects: dict[str, str] = {}
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            reload_listening_content(client=_make_client(objects))
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(ListeningPractice.query.count(), 0)
        self.assertEqual(ListeningProgress.query.count(), 0)


if __name__ == "__main__":
    unittest.main()
