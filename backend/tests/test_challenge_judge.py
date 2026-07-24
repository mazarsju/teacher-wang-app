import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.chat_service import (  # noqa: E402
    ChallengeJudgeResult,
    LlmTokenUsage,
    judge_challenge_progress,
)


class TestChallengeJudge(unittest.TestCase):
    @patch("backend.chat_service.get_llm")
    def test_judge_challenge_progress_returns_completed_task_ids(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"completed_task_ids": ["call-waiter", "ask-bill"]}',
            usage_metadata={"input_tokens": 40, "output_tokens": 8},
        )
        mock_get_llm.return_value = mock_llm

        result = judge_challenge_progress(
            [
                {"role": "user", "content": "服务员！"},
                {"role": "assistant", "content": "您好，请问需要什么？"},
                {"role": "user", "content": "买单"},
            ],
            [
                {"id": "call-waiter", "label": "Call the waiter"},
                {"id": "ask-bill", "label": "Ask for the bill"},
                {"id": "pay-bill", "label": "Pay the bill"},
            ],
        )

        self.assertEqual(
            result,
            ChallengeJudgeResult(
                completed_task_ids=["call-waiter", "ask-bill"],
                token_usage=LlmTokenUsage(input_tokens=40, output_tokens=8),
            ),
        )
        system_prompt = mock_llm.invoke.call_args.args[0][0].content
        self.assertIn("Challenge Judge", system_prompt)

    @patch("backend.chat_service.get_llm")
    def test_judge_ignores_unknown_task_ids(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"completed_task_ids": ["call-waiter", "made-up"]}',
        )
        mock_get_llm.return_value = mock_llm

        result = judge_challenge_progress(
            [{"role": "user", "content": "服务员"}],
            [{"id": "call-waiter", "label": "Call the waiter"}],
        )

        self.assertEqual(result.completed_task_ids, ["call-waiter"])

    def test_judge_returns_empty_for_empty_conversation(self):
        result = judge_challenge_progress(
            [],
            [{"id": "call-waiter", "label": "Call the waiter"}],
        )
        self.assertEqual(result.completed_task_ids, [])


if __name__ == "__main__":
    unittest.main()
