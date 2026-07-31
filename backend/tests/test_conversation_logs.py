import bootstrap  # noqa: F401
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.conversation_log_storage import (
    LocalConversationLogStorage,
    reset_storage_for_tests,
)
from backend.conversation_logs import (
    append_message,
    append_thread_message,
    clear_conversation,
    create_correction_thread,
    load_conversation,
    load_thread,
    should_append_user_message,
)

TEST_USER = "user-a"


class TestConversationLogs(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.logs_dir = Path(self.temp_dir.name)
        reset_storage_for_tests(LocalConversationLogStorage(self.logs_dir))
        self.addCleanup(reset_storage_for_tests)

        self.dir_patcher = patch(
            "backend.conversation_log_storage.CONVERSATION_LOGS_DIR",
            self.logs_dir,
        )
        self.dir_patcher.start()
        self.addCleanup(self.dir_patcher.stop)

    def test_append_and_load_conversation(self):
        append_message(TEST_USER, "teacher-wang", "user", "你好")
        append_message(TEST_USER, "teacher-wang", "assistant", "你好！")

        self.assertEqual(
            load_conversation(TEST_USER, "teacher-wang"),
            [
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好！"},
            ],
        )

        log_file = self.logs_dir / "users" / TEST_USER / "teacher-wang.txt"
        self.assertEqual(
            log_file.read_text(encoding="utf-8"),
            "me: 你好\nagent: 你好！\n",
        )

    def test_logs_are_isolated_per_user(self):
        append_message("user-a", "teacher-wang", "user", "你好")
        append_message("user-b", "teacher-wang", "user", "Hello")

        self.assertEqual(
            load_conversation("user-a", "teacher-wang"),
            [{"role": "user", "content": "你好"}],
        )
        self.assertEqual(
            load_conversation("user-b", "teacher-wang"),
            [{"role": "user", "content": "Hello"}],
        )

    def test_append_and_load_user_message_with_correction_thread(self):
        thread_id, thread_messages = create_correction_thread(
            TEST_USER,
            "xiao-ming",
            "Say 我很好 instead of 我是很好.",
        )
        append_message(
            TEST_USER,
            "xiao-ming",
            "user",
            "我是很好",
            correction_thread_id=thread_id,
        )
        append_message(TEST_USER, "xiao-ming", "assistant", "我也很好！")

        loaded = load_conversation(TEST_USER, "xiao-ming")
        self.assertEqual(loaded[0]["role"], "user")
        self.assertEqual(loaded[0]["content"], "我是很好")
        self.assertEqual(loaded[0]["correctionThreadId"], thread_id)
        self.assertEqual(loaded[0]["correctionThread"], thread_messages)
        self.assertEqual(
            loaded[0]["correctionAnswer"],
            "Say 我很好 instead of 我是很好.",
        )
        self.assertEqual(
            loaded[1],
            {"role": "assistant", "content": "我也很好！"},
        )
        self.assertEqual(
            load_thread(TEST_USER, "xiao-ming", thread_id),
            thread_messages,
        )

    def test_append_thread_message_extends_correction_thread(self):
        thread_id, _ = create_correction_thread(
            TEST_USER,
            "xiao-ming",
            "Say 我很好 instead of 我是很好.",
        )
        append_thread_message(TEST_USER, "xiao-ming", thread_id, "user", "Why?")
        append_thread_message(
            TEST_USER,
            "xiao-ming",
            thread_id,
            "assistant",
            "Because 是 is not used that way.",
        )

        self.assertEqual(
            load_thread(TEST_USER, "xiao-ming", thread_id),
            [
                {
                    "role": "assistant",
                    "content": "Say 我很好 instead of 我是很好.",
                },
                {"role": "user", "content": "Why?"},
                {
                    "role": "assistant",
                    "content": "Because 是 is not used that way.",
                },
            ],
        )

        # Thread chat must not appear in Teacher Wang's standalone history.
        self.assertEqual(load_conversation(TEST_USER, "teacher-wang"), [])

    def test_migrates_legacy_correction_lines_into_threads(self):
        log_file = self.logs_dir / "users" / TEST_USER / "xiao-ming.txt"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        log_file.write_text(
            "me: 我是很好\n"
            "correction: Say 我很好 instead of 我是很好.\n"
            "agent: 我也很好！\n",
            encoding="utf-8",
        )

        loaded = load_conversation(TEST_USER, "xiao-ming")
        thread_id = loaded[0]["correctionThreadId"]
        self.assertTrue(thread_id)
        self.assertEqual(
            loaded[0]["correctionThread"],
            [
                {
                    "role": "assistant",
                    "content": "Say 我很好 instead of 我是很好.",
                }
            ],
        )
        rewritten = log_file.read_text(encoding="utf-8")
        self.assertIn(f"correction-thread: {thread_id}", rewritten)
        self.assertNotIn("correction: ", rewritten)

    def test_append_message_rejects_thread_on_assistant(self):
        with self.assertRaisesRegex(
            ValueError,
            "Only user messages can link a correction thread",
        ):
            append_message(
                TEST_USER,
                "xiao-ming",
                "assistant",
                "你好",
                correction_thread_id="abc123",
            )

    def test_load_conversation_returns_empty_list_when_file_missing(self):
        self.assertEqual(load_conversation(TEST_USER, "xiao-ming"), [])

    def test_clear_conversation_removes_log_file_and_threads(self):
        thread_id, _ = create_correction_thread(TEST_USER, "xiao-ming", "Fix this.")
        append_message(
            TEST_USER,
            "xiao-ming",
            "user",
            "坏句子",
            correction_thread_id=thread_id,
        )
        append_message(TEST_USER, "xiao-ming", "assistant", "好的")

        clear_conversation(TEST_USER, "xiao-ming")

        self.assertEqual(load_conversation(TEST_USER, "xiao-ming"), [])
        self.assertFalse(
            (self.logs_dir / "users" / TEST_USER / "xiao-ming.txt").exists()
        )
        self.assertFalse(
            (
                self.logs_dir
                / "users"
                / TEST_USER
                / "xiao-ming"
                / "threads"
                / f"{thread_id}.txt"
            ).exists()
        )

    def test_clear_conversation_is_noop_when_file_missing(self):
        clear_conversation(TEST_USER, "xiao-ming")
        self.assertEqual(load_conversation(TEST_USER, "xiao-ming"), [])

    def test_should_append_user_message_avoids_duplicate_user_entries(self):
        append_message(TEST_USER, "xiao-ming", "user", "Hello")

        self.assertFalse(
            should_append_user_message(
                TEST_USER,
                "xiao-ming",
                {"role": "user", "content": "Hello"},
            )
        )
        self.assertTrue(
            should_append_user_message(
                TEST_USER,
                "xiao-ming",
                {"role": "user", "content": "How are you?"},
            )
        )


if __name__ == "__main__":
    unittest.main()
