import bootstrap  # noqa: F401
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.utils.aiChat.conversation_log_storage import (
    LocalConversationLogStorage,
    reset_storage_for_tests,
)
from backend.utils.writing.writing_drafts import complete_draft, load_draft, save_draft

TEST_USER = "user-a"


class TestWritingDrafts(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        reset_storage_for_tests(LocalConversationLogStorage(self.logs_dir))
        self.addCleanup(reset_storage_for_tests)

    def test_load_draft_defaults_to_empty_when_nothing_saved(self):
        self.assertEqual(
            load_draft(TEST_USER, "writing-present-yourself"),
            {"draft": "", "archive": []},
        )

    def test_save_and_load_draft(self):
        result = save_draft(TEST_USER, "writing-present-yourself", "我叫小明。")

        self.assertEqual(result, {"draft": "我叫小明。", "archive": []})
        self.assertEqual(
            load_draft(TEST_USER, "writing-present-yourself"),
            {"draft": "我叫小明。", "archive": []},
        )

        draft_file = (
            self.logs_dir
            / "users"
            / TEST_USER
            / "writing"
            / "writing-present-yourself.json"
        )
        self.assertTrue(draft_file.is_file())

    def test_saving_again_overwrites_the_draft_but_keeps_the_archive(self):
        save_draft(TEST_USER, "writing-present-yourself", "draft one")

        draft_file = (
            self.logs_dir
            / "users"
            / TEST_USER
            / "writing"
            / "writing-present-yourself.json"
        )
        draft_file.write_text(
            '{"draft": "draft one", "archive": [{"timestamp": "t", "content": "c"}]}',
            encoding="utf-8",
        )

        result = save_draft(TEST_USER, "writing-present-yourself", "draft two")

        self.assertEqual(
            result,
            {"draft": "draft two", "archive": [{"timestamp": "t", "content": "c"}]},
        )

    def test_drafts_are_isolated_per_user(self):
        save_draft("user-a", "writing-present-yourself", "a's draft")
        save_draft("user-b", "writing-present-yourself", "b's draft")

        self.assertEqual(load_draft("user-a", "writing-present-yourself")["draft"], "a's draft")
        self.assertEqual(load_draft("user-b", "writing-present-yourself")["draft"], "b's draft")

    def test_drafts_are_isolated_per_topic(self):
        save_draft(TEST_USER, "writing-present-yourself", "topic one")
        save_draft(TEST_USER, "writing-daily-life", "topic two")

        self.assertEqual(load_draft(TEST_USER, "writing-present-yourself")["draft"], "topic one")
        self.assertEqual(load_draft(TEST_USER, "writing-daily-life")["draft"], "topic two")

    def test_rejects_invalid_topic_id(self):
        with self.assertRaises(ValueError):
            save_draft(TEST_USER, "../secrets", "x")
        with self.assertRaises(ValueError):
            load_draft(TEST_USER, "not/a/topic")

    def test_complete_draft_appends_a_timestamped_archive_entry(self):
        save_draft(TEST_USER, "writing-present-yourself", "draft in progress")

        result = complete_draft(TEST_USER, "writing-present-yourself", "我叫小明。")

        self.assertEqual(result["draft"], "我叫小明。")
        self.assertEqual(len(result["archive"]), 1)
        self.assertEqual(result["archive"][0]["content"], "我叫小明。")
        self.assertTrue(result["archive"][0]["timestamp"])
        self.assertEqual(load_draft(TEST_USER, "writing-present-yourself"), result)

    def test_complete_draft_appends_to_existing_archive(self):
        complete_draft(TEST_USER, "writing-present-yourself", "first version")

        result = complete_draft(TEST_USER, "writing-present-yourself", "second version")

        self.assertEqual(len(result["archive"]), 2)
        self.assertEqual(result["archive"][0]["content"], "first version")
        self.assertEqual(result["archive"][1]["content"], "second version")

    def test_complete_draft_rejects_invalid_topic_id(self):
        with self.assertRaises(ValueError):
            complete_draft(TEST_USER, "../secrets", "x")


if __name__ == "__main__":
    unittest.main()
