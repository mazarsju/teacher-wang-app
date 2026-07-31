import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.chat_service import (  # noqa: E402
    ChatReplyResult,
    GrammarCorrection,
    LlmTokenUsage,
    check_user_grammar,
    find_unknown_characters,
    generate_chat_reply,
)


class TestFindUnknownCharacters(unittest.TestCase):
    def test_find_unknown_characters_returns_sorted_unknowns(self):
        self.assertEqual(
            find_unknown_characters("你好世界", {"你", "好"}),
            ["世", "界"],
        )

    def test_find_unknown_characters_ignores_non_han(self):
        self.assertEqual(
            find_unknown_characters("Hello 你好!", {"你", "好"}),
            [],
        )


class _FreePlanTokenMixin:
    def setUp(self):
        super().setUp()
        self.current_user_patcher = patch(
            "backend.user_context.current_user",
            return_value=MagicMock(id="test-user", plan="free"),
        )
        self.assert_tokens_patcher = patch(
            "backend.settings.assert_free_plan_has_tokens"
        )
        self.deduct_tokens_patcher = patch(
            "backend.settings.deduct_available_token"
        )
        self.current_user_patcher.start()
        self.assert_tokens_patcher.start()
        self.deduct_tokens_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)
        self.addCleanup(self.assert_tokens_patcher.stop)
        self.addCleanup(self.deduct_tokens_patcher.stop)


class TestGenerateChatReply(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.chat_service.Character")
    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.chat_service.get_llm")
    def test_generate_chat_reply_returns_assistant_message(
        self, mock_get_llm, _mock_speaking_level, mock_character_cls
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(char="你"),
            MagicMock(char="好"),
        ]
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="你好！")
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(
            reply,
            ChatReplyResult(content="你好！", unknown_characters=[]),
        )
        mock_llm.invoke.assert_called_once()
        invoked_messages = mock_llm.invoke.call_args.args[0]
        self.assertIn("Teacher Wang", invoked_messages[0].content)
        self.assertIn(
            "understandable by an HSK 3 level student",
            invoked_messages[0].content,
        )
        self.assertEqual(invoked_messages[1].content, "你好")

    @patch("backend.chat_service.Character")
    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.chat_service.get_llm")
    def test_rephrases_when_reply_contains_unknown_characters(
        self, mock_get_llm, _mock_speaking_level, mock_character_cls
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(char="你"),
            MagicMock(char="好"),
        ]
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(
                content="你好世界",
                usage_metadata={"input_tokens": 10, "output_tokens": 4},
            ),
            MagicMock(
                content="你好！",
                usage_metadata={"input_tokens": 12, "output_tokens": 3},
            ),
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "xiao-ming",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(
            reply,
            ChatReplyResult(
                content="你好！",
                unknown_characters=[],
                token_usage=LlmTokenUsage(input_tokens=22, output_tokens=7),
            ),
        )
        self.assertEqual(mock_llm.invoke.call_count, 2)
        rephrase_prompt = mock_llm.invoke.call_args_list[1].args[0][-1].content
        self.assertIn("世", rephrase_prompt)
        self.assertIn("界", rephrase_prompt)

    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.chat_service.get_llm")
    def test_skips_retry_when_disabled_for_character(
        self, mock_get_llm, _mock_speaking_level
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="你好世界")
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(
            reply,
            ChatReplyResult(content="你好世界", unknown_characters=[]),
        )
        mock_llm.invoke.assert_called_once()

    @patch("backend.chat_service.Character")
    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.chat_service.get_llm")
    def test_ships_reply_with_fewest_unknowns_after_failed_rephrases(
        self, mock_get_llm, _mock_speaking_level, mock_character_cls
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(char="你"),
            MagicMock(char="好"),
        ]
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(content="你好世界"),  # 世, 界
            MagicMock(content="你好啊"),  # 啊 — best
            MagicMock(content="你好吗呢"),  # 吗, 呢
            MagicMock(content="你好世界啊"),  # 世, 界, 啊
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "xiao-ming",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(
            reply,
            ChatReplyResult(
                content="你好啊",
                unknown_characters=[
                    ["世", "界"],
                    ["啊"],
                    ["吗", "呢"],
                    ["世", "啊", "界"],
                ],
            ),
        )
        self.assertEqual(mock_llm.invoke.call_count, 4)

    def test_generate_chat_reply_rejects_unknown_character(self):
        with self.assertRaises(ValueError):
            generate_chat_reply(
                "test-user",
                "unknown",
                [{"role": "user", "content": "你好"}],
            )

    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    def test_generate_chat_reply_requires_user_message_last(self, _mock_speaking_level):
        with self.assertRaises(ValueError):
            generate_chat_reply(
                "test-user",
                "xiao-ming",
                [{"role": "assistant", "content": "你好"}],
            )


class TestCheckUserGrammar(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=2)
    @patch("backend.chat_service.get_llm")
    def test_check_user_grammar_returns_correct(self, mock_get_llm, _mock_level):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content='{"correct": true}')
        mock_get_llm.return_value = mock_llm

        result = check_user_grammar("test-user", "你好")

        self.assertEqual(result, GrammarCorrection(correct=True))
        invoked_messages = mock_llm.invoke.call_args.args[0]
        self.assertIn("Teacher Wang", invoked_messages[0].content)
        self.assertIn("JSON object", invoked_messages[0].content)
        self.assertEqual(invoked_messages[1].content, "你好")

    @patch("backend.hsk_level.get_chat_speaking_hsk_level", return_value=2)
    @patch("backend.chat_service.get_llm")
    def test_check_user_grammar_returns_answer_when_incorrect(
        self, mock_get_llm, _mock_level
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content=(
                '```json\n{"correct": false, "answer": "Use 我很好 instead."}\n```'
            )
        )
        mock_get_llm.return_value = mock_llm

        result = check_user_grammar("test-user", "我是很好")

        self.assertEqual(
            result,
            GrammarCorrection(correct=False, answer="Use 我很好 instead."),
        )
        self.assertEqual(
            result.to_dict(),
            {"correct": False, "answer": "Use 我很好 instead."},
        )


if __name__ == "__main__":
    unittest.main()
