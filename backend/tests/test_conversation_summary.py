import bootstrap  # noqa: F401
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from backend.utils.aiChat.conversation_summary import (
    GENERIC_SUMMARY_SYSTEM_PROMPT,
    MIN_MESSAGES_FOR_CONTEXT_SUMMARY,
    SUMMARY_TRIGGER_MESSAGE_COUNT,
    TEACHER_WANG_SUMMARY_SYSTEM_PROMPT,
    _last_n_user_turns,
    _summarize_and_store,
    context_summary_for_turn,
    count_user_messages,
    delete_conversation_summaries,
    should_summarize,
    store_conversation_summary,
)
from backend.utils.aiChat.token_usage import get_total_tokens
from backend.utils.database.extensions import db
from backend.utils.database.models import ConversationSummary
from backend.utils.database.settings import get_available_token, set_setting, SETTING_AVAILABLE_TOKEN
from postgres_test_case import PostgresTestCase


class TestShouldSummarize(unittest.TestCase):
    def test_true_on_multiples_of_trigger_count(self):
        self.assertTrue(should_summarize(SUMMARY_TRIGGER_MESSAGE_COUNT))
        self.assertTrue(should_summarize(SUMMARY_TRIGGER_MESSAGE_COUNT * 2))

    def test_false_otherwise(self):
        self.assertFalse(should_summarize(0))
        self.assertFalse(should_summarize(1))
        self.assertFalse(should_summarize(SUMMARY_TRIGGER_MESSAGE_COUNT - 1))


class TestCountUserMessages(unittest.TestCase):
    def test_counts_only_user_role_messages(self):
        messages = [
            {"role": "user", "content": "a"},
            {"role": "assistant", "content": "b"},
            {"role": "user", "content": "c"},
        ]
        self.assertEqual(count_user_messages(messages), 2)

    def test_empty_list_counts_zero(self):
        self.assertEqual(count_user_messages([]), 0)


class TestLastNUserTurns(unittest.TestCase):
    def test_includes_interleaved_assistant_messages(self):
        messages = [
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
            {"role": "user", "content": "u3"},
        ]
        self.assertEqual(
            _last_n_user_turns(messages, 2),
            [
                {"role": "user", "content": "u2"},
                {"role": "assistant", "content": "a2"},
                {"role": "user", "content": "u3"},
            ],
        )

    def test_returns_everything_when_not_enough_user_turns(self):
        messages = [{"role": "user", "content": "u1"}]
        self.assertEqual(_last_n_user_turns(messages, 5), messages)

    def test_zero_or_negative_returns_empty(self):
        messages = [{"role": "user", "content": "u1"}]
        self.assertEqual(_last_n_user_turns(messages, 0), [])
        self.assertEqual(_last_n_user_turns(messages, -1), [])


class TestStoreConversationSummary(PostgresTestCase):
    def test_stores_first_revision_as_latest(self):
        memory = {"teaching_context": {"current_topic": "greetings"}}
        store_conversation_summary(self.user_id, "teacher-wang", memory)

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].conversation_id, "teacher-wang")
        self.assertEqual(rows[0].summary, memory)
        self.assertEqual(rows[0].revision, 1)
        self.assertTrue(rows[0].latest)

    def test_marks_previous_summary_not_latest(self):
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 1})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 2})

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).order_by(
            ConversationSummary.id
        ).all()
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0].latest)
        self.assertTrue(rows[1].latest)
        self.assertEqual(rows[1].summary, {"v": 2})

    def test_keeps_at_most_two_rows_dropping_the_oldest(self):
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 1})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 2})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 3})

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).order_by(
            ConversationSummary.id
        ).all()
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0].latest)
        self.assertEqual(rows[0].summary, {"v": 2})
        self.assertTrue(rows[1].latest)
        self.assertEqual(rows[1].summary, {"v": 3})

    def test_revision_increments_from_previous_latest(self):
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 1})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 2})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 3})

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).order_by(
            ConversationSummary.id
        ).all()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].revision, 2)
        self.assertEqual(rows[1].revision, 3)

    def test_does_not_affect_other_conversations(self):
        store_conversation_summary(self.user_id, "xiao-ming", {"v": "other"})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 1})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": 2})

        other_rows = ConversationSummary.query.filter_by(
            user_id=self.user_id, conversation_id="xiao-ming"
        ).all()
        self.assertEqual(len(other_rows), 1)
        self.assertTrue(other_rows[0].latest)


class TestContextSummaryForTurn(PostgresTestCase):
    def setUp(self):
        super().setUp()
        store_conversation_summary(self.user_id, "teacher-wang", {"v": "old"})
        store_conversation_summary(self.user_id, "teacher-wang", {"v": "current"})

    def test_returns_none_below_the_minimum_message_count(self):
        for count in range(MIN_MESSAGES_FOR_CONTEXT_SUMMARY):
            self.assertIsNone(
                context_summary_for_turn(self.user_id, "teacher-wang", count)
            )

    def test_returns_old_summary_when_remainder_below_three(self):
        # 8 % 4 = 0, 9 % 4 = 1, 10 % 4 = 2
        for count in (8, 9, 10):
            self.assertEqual(
                context_summary_for_turn(self.user_id, "teacher-wang", count),
                {"v": "old"},
            )

    def test_returns_current_summary_when_remainder_at_least_three(self):
        # 11 % 4 = 3, 15 % 4 = 3
        for count in (11, 15):
            self.assertEqual(
                context_summary_for_turn(self.user_id, "teacher-wang", count),
                {"v": "current"},
            )

    def test_returns_none_when_no_matching_row_exists(self):
        self.assertIsNone(
            context_summary_for_turn(self.user_id, "xiao-ming", 10)
        )


class TestDeleteConversationSummaries(PostgresTestCase):
    def setUp(self):
        super().setUp()
        store_conversation_summary(self.user_id, "teacher-wang", {"v": "A"})
        store_conversation_summary(self.user_id, "xiao-ming", {"v": "B"})

    def test_deletes_only_matching_conversation(self):
        delete_conversation_summaries(self.user_id, "teacher-wang")

        remaining = ConversationSummary.query.filter_by(user_id=self.user_id).all()
        self.assertEqual([row.conversation_id for row in remaining], ["xiao-ming"])

    def test_deletes_all_conversations_for_user_when_no_character_given(self):
        delete_conversation_summaries(self.user_id)

        self.assertEqual(ConversationSummary.query.filter_by(user_id=self.user_id).count(), 0)


class TestSummarizeAndStore(PostgresTestCase):
    def setUp(self):
        super().setUp()

        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        price_path = Path(self.temp_dir.name) / "token_price.json"
        price_path.write_text(
            json.dumps(
                [
                    {
                        "companyName": "openai",
                        "modelName": "gpt-4o-mini",
                        "inputPrice": 0.15,
                        "outputPrice": 0.6,
                    }
                ]
            ),
            encoding="utf-8",
        )
        self.price_patcher = patch(
            "backend.utils.aiChat.token_usage.TOKEN_PRICE_PATH", price_path
        )
        self.price_patcher.start()
        self.addCleanup(self.price_patcher.stop)
        self.model_patcher = patch(
            "backend.utils.aiChat.token_usage.read_llm_config",
            return_value={"LLM_MODEL": "gpt-4o-mini"},
        )
        self.model_patcher.start()
        self.addCleanup(self.model_patcher.stop)

    def test_stores_parsed_json_memory_from_llm_response(self):
        memory = {"teaching_context": {"current_topic": "greetings"}}
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content=json.dumps(memory)
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].summary, memory)

    def test_uses_teacher_wang_prompt_for_teacher_wang(self):
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content=json.dumps({"teaching_context": {}})
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        messages = mock_get_llm.return_value.invoke.call_args.args[0]
        self.assertEqual(messages[0].content, TEACHER_WANG_SUMMARY_SYSTEM_PROMPT)

    def test_uses_generic_prompt_for_other_characters(self):
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content=json.dumps({"conversation_context": {}})
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "xiao-ming")

        messages = mock_get_llm.return_value.invoke.call_args.args[0]
        self.assertEqual(messages[0].content, GENERIC_SUMMARY_SYSTEM_PROMPT)

    def test_includes_existing_memory_and_only_newest_user_turns_in_prompt(self):
        store_conversation_summary(self.user_id, "teacher-wang", {"teaching_context": "prior"})
        # Alternating user/assistant messages, starting with user: this has
        # SUMMARY_TRIGGER_MESSAGE_COUNT + 1 user turns, one more than the
        # window, so exactly the oldest user turn (and its content) should
        # be dropped from the prompt.
        total = 2 * SUMMARY_TRIGGER_MESSAGE_COUNT + 2
        many_messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg{i}"}
            for i in range(total)
        ]

        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=many_messages,
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content=json.dumps({"teaching_context": "updated"})
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        human_content = mock_get_llm.return_value.invoke.call_args.args[0][1].content
        self.assertIn('"teaching_context": "prior"', human_content)
        self.assertNotIn("msg0", human_content)
        self.assertNotIn("msg1", human_content)
        self.assertIn("msg2", human_content)
        self.assertIn(f"msg{total - 1}", human_content)

    def test_swallows_llm_errors_without_storing_a_row(self):
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm",
            side_effect=RuntimeError("boom"),
        ):
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        self.assertEqual(ConversationSummary.query.filter_by(user_id=self.user_id).count(), 0)

    def test_records_and_deducts_token_usage_on_success(self):
        starting_available = get_available_token(self.user_id)
        # _summarize_and_store opens its own app context (a separate DB
        # session, scoped by Flask-SQLAlchemy per app-context id) since in
        # production it runs from a background thread with no request
        # context — commit here so that session isn't left waiting on this
        # (uncommitted, from ensure_default_settings) one's row lock.
        db.session.commit()

        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content=json.dumps({"teaching_context": {}}),
                usage_metadata={"input_tokens": 50, "output_tokens": 20},
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        self.assertEqual(get_total_tokens(self.user_id), 70)
        self.assertEqual(get_available_token(self.user_id), starting_available - 70)

    def test_skips_llm_call_and_storage_when_free_plan_quota_exhausted(self):
        set_setting(self.user_id, SETTING_AVAILABLE_TOKEN, "0", commit=True)

        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.chat_service.get_llm"
        ) as mock_get_llm:
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        mock_get_llm.return_value.invoke.assert_not_called()
        self.assertEqual(ConversationSummary.query.filter_by(user_id=self.user_id).count(), 0)
        self.assertEqual(get_total_tokens(self.user_id), 0)


if __name__ == "__main__":
    unittest.main()
