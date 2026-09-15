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
    fetch_listening_breakdown,
    fetch_listening_exercises,
    fetch_listening_practice_translations,
    fetch_listening_speaker_names,
    fetch_listening_text,
    list_listening_audio_segments,
    read_listening_audio,
    read_listening_audio_segment,
    reload_listening_content,
)
from postgres_test_case import PostgresTestCase


class _FakeBody:
    def __init__(self, content: str | bytes):
        self._content = content

    def read(self):
        return (
            self._content
            if isinstance(self._content, bytes)
            else self._content.encode("utf-8")
        )


def _make_client(objects: dict[str, str | bytes]) -> MagicMock:
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
                "type: dialog\n"
                "topic: family\n"
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
        self.assertEqual(topic.type, "dialog")
        self.assertEqual(topic.topic, "family")
        self.assertEqual(topic.grammar_rules, "hsk1_basic_sentence_structure")
        self.assertEqual(topic.unique_chars, "你好")

    def test_ignores_writing_practice_overview_files_in_same_bucket(self):
        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
                "type: dialog\ntopic: family\n"
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
            ListeningPractice(
                id="stale", title="Stale", hsk_level=1, type="dialog", topic="test"
            )
        )
        db.session.commit()

        objects = {
            "listening_practice/hsk1/listening-family-size/overview.yaml": (
                "id: listening-family-size\ntitle: Family size\nhskLevel: 1\n"
                "type: dialog\ntopic: family\n"
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
                "type: dialog\ntopic: family\n"
            ),
            "listening_practice/hsk1/b/overview.yaml": (
                "id: listening-family-size\ntitle: Duplicate\nhskLevel: 1\n"
                "type: dialog\ntopic: family\n"
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
                "type: dialog\n"
                "topic: family\n"
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
                "type: dialog\ntopic: family\n"
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
            ListeningPractice(
                id="listening-family-size",
                title="Family size",
                hsk_level=1,
                type="dialog",
                topic="family",
            )
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
                "type: dialog\ntopic: family\n"
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
            ListeningPractice(
                id="listening-stale",
                title="Stale",
                hsk_level=1,
                type="dialog",
                topic="test",
            )
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


class TestFetchListeningText(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_reads_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "text.txt").write_text("你好\n")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                text = fetch_listening_text(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(text, "你好\n")

    def test_missing_file_returns_none(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = temp_dir
            try:
                text = fetch_listening_text(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertIsNone(text)

    def test_reads_from_s3(self):
        client = _make_client(
            {"listening_practice/hsk1/listening-family-size/text.txt": "你好\n"}
        )
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            text = fetch_listening_text(1, "listening-family-size", client=client)
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(text, "你好\n")


class TestFetchListeningSpeakerNames(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_reads_names_from_local_overview_yaml(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "overview.yaml").write_text(
                "manName: 大卫\nwomanName: 小美\n"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                names = fetch_listening_speaker_names(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(names, {"manName": "大卫", "womanName": "小美"})

    def test_missing_names_are_omitted(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "overview.yaml").write_text("title: Family size\n")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                names = fetch_listening_speaker_names(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(names, {})

    def test_missing_file_returns_empty_dict(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = temp_dir
            try:
                names = fetch_listening_speaker_names(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(names, {})

    def test_reads_from_s3(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/overview.yaml": (
                    "manName: 大卫\nwomanName: 小美\n"
                )
            }
        )
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            names = fetch_listening_speaker_names(
                1, "listening-family-size", client=client
            )
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(names, {"manName": "大卫", "womanName": "小美"})


class TestReadListeningAudio(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_reads_full_audio_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "audio.mp3").write_bytes(b"\x00\x01fake-mp3")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                audio = read_listening_audio(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(audio, b"\x00\x01fake-mp3")

    def test_missing_full_audio_returns_none(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = temp_dir
            try:
                audio = read_listening_audio(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertIsNone(audio)

    def test_reads_full_audio_from_s3(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/audio.mp3": (
                    b"\x00\x01fake-mp3"
                )
            }
        )
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            audio = read_listening_audio(1, "listening-family-size", client=client)
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(audio, b"\x00\x01fake-mp3")

    def test_reads_audio_segment_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            audio_dir = (
                root
                / "listening_practice"
                / "hsk1"
                / "listening-family-size"
                / "audio"
            )
            audio_dir.mkdir(parents=True)
            (audio_dir / "audio-1.mp3").write_bytes(b"segment-1")
            (audio_dir / "audio-2.mp3").write_bytes(b"segment-2")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                first = read_listening_audio_segment(1, "listening-family-size", 1)
                missing = read_listening_audio_segment(1, "listening-family-size", 3)
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(first, b"segment-1")
        self.assertIsNone(missing)

    def test_reads_chunk_audio_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            audio_dir = (
                root
                / "listening_practice"
                / "hsk1"
                / "listening-family-size"
                / "audio"
            )
            audio_dir.mkdir(parents=True)
            (audio_dir / "audio-2-1.mp3").write_bytes(b"chunk-2-1")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                chunk = read_listening_audio_segment(
                    1, "listening-family-size", 2, chunk=1
                )
                missing = read_listening_audio_segment(
                    1, "listening-family-size", 2, chunk=9
                )
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(chunk, b"chunk-2-1")
        self.assertIsNone(missing)


class TestListListeningAudioSegments(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_lists_and_sorts_segment_numbers_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            audio_dir = (
                root
                / "listening_practice"
                / "hsk1"
                / "listening-family-size"
                / "audio"
            )
            audio_dir.mkdir(parents=True)
            for name in ("audio-2.mp3", "audio-1.mp3", "audio-10.mp3", "not-audio.txt"):
                (audio_dir / name).write_bytes(b"x")

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                segments = list_listening_audio_segments(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(segments, [1, 2, 10])

    def test_missing_audio_folder_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = temp_dir
            try:
                segments = list_listening_audio_segments(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(segments, [])

    def test_lists_segments_from_s3(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/audio/audio-1.mp3": b"x",
                "listening_practice/hsk1/listening-family-size/audio/audio-2.mp3": b"x",
            }
        )
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            segments = list_listening_audio_segments(
                1, "listening-family-size", client=client
            )
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(segments, [1, 2])


class TestFetchListeningBreakdown(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def _write_breakdown(self, topic_dir: Path) -> None:
        topic_dir.mkdir(parents=True)
        (topic_dir / "breakdown.json").write_text(
            '{"sentences": ['
            '{"id": 1, "transcript": "[neutral]你好", "mandarin": "你好", '
            '"english": "Hello"},'
            '{"id": 2, "transcript": "[neutral]再见", "mandarin": "再见", '
            '"english": "Goodbye"}'
            "]}"
        )

    def test_defaults_to_english_field(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self._write_breakdown(
                root / "listening_practice" / "hsk1" / "listening-family-size"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                sentences = fetch_listening_breakdown(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(
            sentences,
            [
                {
                    "id": 1,
                    "mandarin": "你好",
                    "translation": "Hello",
                    "speaker": "",
                    "chunks": [],
                },
                {
                    "id": 2,
                    "mandarin": "再见",
                    "translation": "Goodbye",
                    "speaker": "",
                    "chunks": [],
                },
            ],
        )

    def test_includes_speaker_when_present(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = (
                root / "listening_practice" / "hsk1" / "listening-family-size"
            )
            topic_dir.mkdir(parents=True)
            (topic_dir / "breakdown.json").write_text(
                '{"sentences": ['
                '{"id": 1, "speaker": "大卫", "transcript": "[neutral]你好", '
                '"mandarin": "你好", "english": "Hello"}'
                "]}"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                sentences = fetch_listening_breakdown(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(sentences[0]["speaker"], "大卫")

    def test_includes_chunks_when_present(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = (
                root / "listening_practice" / "hsk1" / "listening-family-size"
            )
            topic_dir.mkdir(parents=True)
            (topic_dir / "breakdown.json").write_text(
                '{"sentences": ['
                '{"id": 1, "transcript": "[neutral]你好，再见", '
                '"mandarin": "你好，再见", "english": "Hello, goodbye", '
                '"chunks": [{"id": 1, "mandarin": "你好，"}, '
                '{"id": 2, "mandarin": "再见"}]}'
                "]}"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                sentences = fetch_listening_breakdown(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(
            sentences[0]["chunks"],
            [{"id": 1, "mandarin": "你好，"}, {"id": 2, "mandarin": "再见"}],
        )

    def test_merges_translated_sibling_for_non_english_language(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = (
                root / "listening_practice" / "hsk1" / "listening-family-size"
            )
            self._write_breakdown(topic_dir)
            (topic_dir / "breakdown_fr.json").write_text(
                '{"sentences": ['
                '{"id": 1, "translate": "Bonjour"},'
                '{"id": 2, "translate": "Au revoir"}'
                "]}"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                sentences = fetch_listening_breakdown(
                    1, "listening-family-size", "fr"
                )
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(
            sentences,
            [
                {
                    "id": 1,
                    "mandarin": "你好",
                    "translation": "Bonjour",
                    "speaker": "",
                    "chunks": [],
                },
                {
                    "id": 2,
                    "mandarin": "再见",
                    "translation": "Au revoir",
                    "speaker": "",
                    "chunks": [],
                },
            ],
        )

    def test_falls_back_to_english_when_translation_sibling_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self._write_breakdown(
                root / "listening_practice" / "hsk1" / "listening-family-size"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                sentences = fetch_listening_breakdown(
                    1, "listening-family-size", "fr"
                )
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(sentences[0]["translation"], "Hello")

    def test_reads_from_s3(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/breakdown.json": (
                    '{"sentences": [{"id": 1, "transcript": "[neutral]你好", '
                    '"mandarin": "你好", "english": "Hello"}]}'
                ),
            }
        )
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            sentences = fetch_listening_breakdown(
                1, "listening-family-size", client=client
            )
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(
            sentences,
            [
                {
                    "id": 1,
                    "mandarin": "你好",
                    "translation": "Hello",
                    "speaker": "",
                    "chunks": [],
                }
            ],
        )


class TestFetchListeningExercises(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    _EXERCISES_JSON = (
        '[{"id": "mcq_001", "type": "multiple_choice", '
        '"question": "How many?", "choices": ["3", "5"], "answer": 1}]'
    )
    _EXERCISES_FR_JSON = (
        '[{"id": "mcq_001", "type": "multiple_choice", '
        '"question": "Combien ?", "choices": ["3", "5"], "answer": 1}]'
    )

    def test_reads_english_exercises_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "exercises.json").write_text(self._EXERCISES_JSON)

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                exercises = fetch_listening_exercises(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(
            exercises,
            [
                {
                    "id": "mcq_001",
                    "type": "multiple_choice",
                    "question": "How many?",
                    "choices": ["3", "5"],
                    "answer": 1,
                }
            ],
        )

    def test_reads_translated_exercises_when_available(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "exercises.json").write_text(self._EXERCISES_JSON)
            (topic_dir / "exercises_fr.json").write_text(self._EXERCISES_FR_JSON)

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                exercises = fetch_listening_exercises(
                    1, "listening-family-size", "fr"
                )
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(exercises[0]["question"], "Combien ?")

    def test_falls_back_to_english_when_translation_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = root / "listening_practice" / "hsk1" / "listening-family-size"
            topic_dir.mkdir(parents=True)
            (topic_dir / "exercises.json").write_text(self._EXERCISES_JSON)

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                exercises = fetch_listening_exercises(
                    1, "listening-family-size", "fr"
                )
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(exercises[0]["question"], "How many?")

    def test_missing_exercises_file_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = temp_dir
            try:
                exercises = fetch_listening_exercises(1, "listening-family-size")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(exercises, [])

    def test_reads_from_s3(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/exercises.json": (
                    self._EXERCISES_JSON
                ),
            }
        )
        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            exercises = fetch_listening_exercises(
                1, "listening-family-size", client=client
            )
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(exercises[0]["question"], "How many?")


class TestFetchListeningPracticeTranslations(unittest.TestCase):
    def setUp(self) -> None:
        self._local_path_env = os.environ.pop("GRAMMAR_CONTENT_S3_PATH", None)
        self.addCleanup(self._restore_local_path_env)

    def _restore_local_path_env(self) -> None:
        if self._local_path_env is not None:
            os.environ["GRAMMAR_CONTENT_S3_PATH"] = self._local_path_env

    def test_returns_empty_for_english(self):
        self.assertEqual(fetch_listening_practice_translations("en"), {})

    def test_reads_translated_fields_from_local_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            topic_dir = (
                root / "listening_practice" / "hsk1" / "listening-family-size"
            )
            topic_dir.mkdir(parents=True)
            (topic_dir / "overview_fr.yaml").write_text(
                "title: Combien de personnes dans ta famille ?\n"
                "type: dialogue\n"
                "topic: famille\n"
            )

            os.environ["GRAMMAR_CONTENT_S3_PATH"] = str(root)
            try:
                translations = fetch_listening_practice_translations("fr")
            finally:
                del os.environ["GRAMMAR_CONTENT_S3_PATH"]

        self.assertEqual(
            translations,
            {
                "listening-family-size": {
                    "title": "Combien de personnes dans ta famille ?",
                    "type": "dialogue",
                    "topic": "famille",
                }
            },
        )

    def test_reads_translated_fields_from_s3(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/overview_fr.yaml": (
                    "title: Combien de personnes dans ta famille ?\n"
                ),
            }
        )

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            translations = fetch_listening_practice_translations("fr", client=client)
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(
            translations,
            {
                "listening-family-size": {
                    "title": "Combien de personnes dans ta famille ?",
                }
            },
        )

    def test_ignores_writing_practice_overview_files_in_same_bucket(self):
        client = _make_client(
            {
                "listening_practice/hsk1/listening-family-size/overview_fr.yaml": (
                    "title: Combien de personnes dans ta famille ?\n"
                ),
                "writing_practice/writing-present-yourself/overview_fr.yaml": (
                    "title: Se présenter\n"
                ),
            }
        )

        os.environ["GRAMMAR_CONTENT_S3_BUCKET"] = "test-bucket"
        try:
            translations = fetch_listening_practice_translations("fr", client=client)
        finally:
            del os.environ["GRAMMAR_CONTENT_S3_BUCKET"]

        self.assertEqual(list(translations.keys()), ["listening-family-size"])


if __name__ == "__main__":
    unittest.main()
