import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.chat_service import (  # noqa: E402
    ChallengeJudgeResult,
    ChallengeReplyResult,
    LlmTokenUsage,
    generate_challenge_reply,
    judge_challenge_progress,
)


TASKS = [
    {"id": "call-waiter", "label": "Call the waiter"},
    {"id": "ask-bill", "label": "Ask for the bill"},
    {"id": "pay-bill", "label": "Pay the bill"},
]


class TestChallengeJudge(unittest.TestCase):
    @patch("backend.chat_service.get_llm")
    def test_judge_challenge_progress_returns_completed_task_ids(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content=(
                '{"completed_task_ids": ["call-waiter", "ask-bill"], '
                '"coherent": true}'
            ),
            usage_metadata={"input_tokens": 40, "output_tokens": 8},
        )
        mock_get_llm.return_value = mock_llm

        result = judge_challenge_progress(
            [
                {"role": "user", "content": "服务员！"},
                {"role": "assistant", "content": "您好，请问需要什么？"},
                {"role": "user", "content": "买单"},
                {"role": "assistant", "content": "好的，这是账单。"},
            ],
            TASKS,
        )

        self.assertEqual(
            result,
            ChallengeJudgeResult(
                completed_task_ids=["call-waiter", "ask-bill"],
                coherent=True,
                token_usage=LlmTokenUsage(input_tokens=40, output_tokens=8),
            ),
        )
        system_prompt = mock_llm.invoke.call_args.args[0][0].content
        self.assertIn("Challenge Judge", system_prompt)
        self.assertIn("accepted / cooperated", system_prompt)
        self.assertIn("refuses", system_prompt)
        self.assertIn("coherent", system_prompt)

    @patch("backend.chat_service.get_llm")
    def test_judge_returns_incoherence_reason(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content=(
                '{"completed_task_ids": [], "coherent": false, '
                '"incoherence_reason": "The waiter accepted payment before ordering."}'
            ),
        )
        mock_get_llm.return_value = mock_llm

        result = judge_challenge_progress(
            [
                {"role": "user", "content": "买单"},
                {"role": "assistant", "content": "好的，一共五十块。"},
            ],
            TASKS,
        )

        self.assertEqual(result.completed_task_ids, [])
        self.assertFalse(result.coherent)
        self.assertEqual(
            result.incoherence_reason,
            "The waiter accepted payment before ordering.",
        )

    @patch("backend.chat_service.get_llm")
    def test_judge_ignores_unknown_task_ids(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content=(
                '{"completed_task_ids": ["call-waiter", "made-up"], '
                '"coherent": true}'
            ),
        )
        mock_get_llm.return_value = mock_llm

        result = judge_challenge_progress(
            [
                {"role": "user", "content": "服务员"},
                {"role": "assistant", "content": "您好"},
            ],
            [{"id": "call-waiter", "label": "Call the waiter"}],
        )

        self.assertEqual(result.completed_task_ids, ["call-waiter"])
        self.assertTrue(result.coherent)

    def test_judge_returns_empty_for_empty_conversation(self):
        result = judge_challenge_progress(
            [],
            [{"id": "call-waiter", "label": "Call the waiter"}],
        )
        self.assertEqual(result.completed_task_ids, [])
        self.assertTrue(result.coherent)

    def test_judge_requires_assistant_as_last_message(self):
        with self.assertRaisesRegex(ValueError, "last message must be from the assistant"):
            judge_challenge_progress(
                [{"role": "user", "content": "服务员"}],
                [{"id": "call-waiter", "label": "Call the waiter"}],
            )


class TestGenerateChallengeReply(unittest.TestCase):
    @patch("backend.chat_service.judge_challenge_progress")
    @patch("backend.chat_service.generate_chat_reply")
    def test_coherent_reply_skips_revision(self, mock_generate, mock_judge):
        mock_generate.return_value = MagicMock(
            content="您好，请问需要什么？",
            unknown_characters=[],
            token_usage=LlmTokenUsage(input_tokens=10, output_tokens=5),
        )
        mock_judge.return_value = ChallengeJudgeResult(
            completed_task_ids=["call-waiter"],
            coherent=True,
            token_usage=LlmTokenUsage(input_tokens=8, output_tokens=2),
        )

        result = generate_challenge_reply(
            "challenge-restaurant",
            [{"role": "user", "content": "服务员！"}],
            TASKS,
        )

        self.assertEqual(
            result,
            ChallengeReplyResult(
                content="您好，请问需要什么？",
                unknown_characters=[],
                completed_task_ids=["call-waiter"],
                judge_conversation=[],
                token_usage=LlmTokenUsage(input_tokens=18, output_tokens=7),
            ),
        )
        mock_generate.assert_called_once()
        mock_judge.assert_called_once()

    @patch("backend.chat_service.judge_challenge_progress")
    @patch("backend.chat_service.generate_chat_reply")
    def test_incoherent_reply_is_revised_once(self, mock_generate, mock_judge):
        mock_generate.side_effect = [
            MagicMock(
                content="好的，一共五十块。",
                unknown_characters=[],
                token_usage=LlmTokenUsage(input_tokens=10, output_tokens=5),
            ),
            MagicMock(
                content="请先点菜。",
                unknown_characters=[],
                token_usage=LlmTokenUsage(input_tokens=12, output_tokens=4),
            ),
        ]
        mock_judge.side_effect = [
            ChallengeJudgeResult(
                completed_task_ids=[],
                coherent=False,
                incoherence_reason="Payment was accepted before ordering.",
                token_usage=LlmTokenUsage(input_tokens=8, output_tokens=3),
            ),
            ChallengeJudgeResult(
                completed_task_ids=[],
                coherent=True,
                token_usage=LlmTokenUsage(input_tokens=9, output_tokens=2),
            ),
        ]

        result = generate_challenge_reply(
            "challenge-restaurant",
            [{"role": "user", "content": "买单"}],
            TASKS,
        )

        self.assertEqual(result.content, "请先点菜。")
        self.assertEqual(result.completed_task_ids, [])
        self.assertEqual(
            result.judge_conversation,
            [
                {"role": "assistant", "content": "好的，一共五十块。"},
                {
                    "role": "judge",
                    "content": (
                        "Your reply is not coherent given the situation. "
                        "Payment was accepted before ordering. "
                        "Please modify your answer."
                    ),
                },
            ],
        )
        self.assertEqual(mock_generate.call_count, 2)
        revision_kwargs = mock_generate.call_args_list[1].kwargs
        self.assertEqual(revision_kwargs["previous_assistant_reply"], "好的，一共五十块。")
        self.assertIn("Payment was accepted before ordering.", revision_kwargs["revision_instruction"])
        self.assertEqual(mock_judge.call_count, 2)

    @patch("backend.chat_service.judge_challenge_progress")
    @patch("backend.chat_service.generate_chat_reply")
    def test_second_incoherence_is_accepted_anyway(self, mock_generate, mock_judge):
        mock_generate.side_effect = [
            MagicMock(
                content="first bad reply",
                unknown_characters=[],
                token_usage=LlmTokenUsage(input_tokens=1, output_tokens=1),
            ),
            MagicMock(
                content="second bad reply",
                unknown_characters=[],
                token_usage=LlmTokenUsage(input_tokens=2, output_tokens=2),
            ),
        ]
        mock_judge.side_effect = [
            ChallengeJudgeResult(
                completed_task_ids=[],
                coherent=False,
                incoherence_reason="First reply breaks progression.",
                token_usage=LlmTokenUsage(input_tokens=1, output_tokens=1),
            ),
            ChallengeJudgeResult(
                completed_task_ids=["call-waiter"],
                coherent=False,
                incoherence_reason="Revised reply still breaks progression.",
                token_usage=LlmTokenUsage(input_tokens=1, output_tokens=1),
            ),
        ]

        result = generate_challenge_reply(
            "challenge-restaurant",
            [{"role": "user", "content": "服务员"}],
            TASKS,
        )

        self.assertEqual(result.content, "second bad reply")
        self.assertEqual(result.completed_task_ids, ["call-waiter"])
        self.assertEqual(
            result.judge_conversation,
            [
                {"role": "assistant", "content": "first bad reply"},
                {
                    "role": "judge",
                    "content": (
                        "Your reply is not coherent given the situation. "
                        "First reply breaks progression. "
                        "Please modify your answer."
                    ),
                },
                {
                    "role": "judge",
                    "content": (
                        "The revised reply is still not coherent, but it will "
                        "be sent anyway. Revised reply still breaks progression."
                    ),
                },
            ],
        )
        self.assertEqual(mock_generate.call_count, 2)
        self.assertEqual(mock_judge.call_count, 2)


if __name__ == "__main__":
    unittest.main()
