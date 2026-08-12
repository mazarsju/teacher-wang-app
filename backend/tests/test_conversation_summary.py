import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

from backend.utils.aiChat.conversation_summary import (
    SUMMARY_TRIGGER_MESSAGE_COUNT,
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
        store_conversation_summary(self.user_id, "teacher-wang", "Learner practiced greetings.")

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].conversation_id, "teacher-wang")
        self.assertEqual(rows[0].summary, {"text": "Learner practiced greetings."})
        self.assertEqual(rows[0].revision, 1)
        self.assertTrue(rows[0].latest)

    def test_marks_previous_summary_not_latest(self):
        store_conversation_summary(self.user_id, "teacher-wang", "First summary.")
        store_conversation_summary(self.user_id, "teacher-wang", "Second summary.")

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).order_by(
            ConversationSummary.id
        ).all()
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0].latest)
        self.assertTrue(rows[1].latest)
        self.assertEqual(rows[1].summary, {"text": "Second summary."})


class TestDeleteConversationSummaries(PostgresTestCase):
    def setUp(self):
        super().setUp()
        store_conversation_summary(self.user_id, "teacher-wang", "Summary A.")
        store_conversation_summary(self.user_id, "xiao-ming", "Summary B.")

    def test_deletes_only_matching_conversation(self):
        delete_conversation_summaries(self.user_id, "teacher-wang")

        remaining = ConversationSummary.query.filter_by(user_id=self.user_id).all()
        self.assertEqual([row.conversation_id for row in remaining], ["xiao-ming"])

    def test_deletes_all_conversations_for_user_when_no_character_given(self):
        delete_conversation_summaries(self.user_id)

        self.assertEqual(ConversationSummary.query.filter_by(user_id=self.user_id).count(), 0)


class TestSummarizeAndStore(PostgresTestCase):
    def test_stores_summary_from_llm_response(self):
        with patch(
            "backend.utils.aiChat.conversation_summary.load_conversation",
            return_value=[{"role": "user", "content": "你好"}],
        ), patch(
            "backend.utils.aiChat.conversation_summary.get_llm"
        ) as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = MagicMock(
                content="The learner said hello."
            )
            _summarize_and_store(self.app, self.user_id, self.cognito_sub, "teacher-wang")

        rows = ConversationSummary.query.filter_by(user_id=self.user_id).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].summary, {"text": "The learner said hello."})

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
