import bootstrap  # noqa: F401
import json
import unittest
from unittest.mock import MagicMock, patch

from backend.utils.aiChat.conversation_summary import (
    GENERIC_SUMMARY_SYSTEM_PROMPT,
    SUMMARY_TRIGGER_MESSAGE_COUNT,
    TEACHER_WANG_SUMMARY_SYSTEM_PROMPT,
    _summarize_and_store,
    delete_conversation_summaries,
    should_summarize,
    store_conversation_summary,
)
from backend.utils.database.models import ConversationSummary
from postgres_test_case import PostgresTestCase


class TestShouldSummarize(unittest.TestCase):
    def test_true_on_multiples_of_trigger_count(self):
        self.assertTrue(should_summarize(SUMMARY_TRIGGER_MESSAGE_COUNT))
        self.assertTrue(should_summarize(SUMMARY_TRIGGER_MESSAGE_COUNT * 2))

    def test_false_otherwise(self):
        self.assertFalse(should_summarize(0))
        self.assertFalse(should_summarize(1))
        self.assertFalse(should_summarize(SUMMARY_TRIGGER_MESSAGE_COUNT - 1))


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
    def test_stores_parsed_json_memory_from_llm_response(self):
        memory = {"teaching_context": {"current_topic": "greetings"}}
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.conversation_summary.get_llm"
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
            "backend.utils.aiChat.conversation_summary.get_llm"
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
            "backend.utils.aiChat.conversation_summary.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content=json.dumps({"conversation_context": {}})
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "xiao-ming")

        messages = mock_get_llm.return_value.invoke.call_args.args[0]
        self.assertEqual(messages[0].content, GENERIC_SUMMARY_SYSTEM_PROMPT)

    def test_includes_existing_memory_and_only_newest_messages_in_prompt(self):
        store_conversation_summary(self.user_id, "teacher-wang", {"teaching_context": "prior"})
        many_messages = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg{i}"}
            for i in range(SUMMARY_TRIGGER_MESSAGE_COUNT + 2)
        ]

        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=many_messages,
        ), patch(
            "backend.utils.aiChat.conversation_summary.get_llm"
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
        self.assertIn(f"msg{SUMMARY_TRIGGER_MESSAGE_COUNT + 1}", human_content)

    def test_swallows_llm_errors_without_storing_a_row(self):
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.conversation_summary.get_llm",
            side_effect=RuntimeError("boom"),
        ):
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        self.assertEqual(ConversationSummary.query.filter_by(user_id=self.user_id).count(), 0)


if __name__ == "__main__":
    unittest.main()
