import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.app import app  # noqa: E402
from auth_stub import (  # noqa: E402
    TEST_USER_ID,
    authenticated_client,
    patch_request_auth,
)


class TestChatEndpoint(unittest.TestCase):
    def setUp(self):
        patch_request_auth(self)
        self.client = authenticated_client(app)
        self.generate_patcher = patch("backend.routes.chat.generate_chat_reply")
        self.mock_generate = self.generate_patcher.start()
        self.addCleanup(self.generate_patcher.stop)

        self.append_patcher = patch("backend.routes.chat.append_message")
        self.mock_append = self.append_patcher.start()
        self.addCleanup(self.append_patcher.stop)

        self.append_thread_patcher = patch(
            "backend.routes.chat.append_thread_message"
        )
        self.mock_append_thread = self.append_thread_patcher.start()
        self.addCleanup(self.append_thread_patcher.stop)

        self.create_thread_patcher = patch(
            "backend.routes.chat.create_correction_thread"
        )
        self.mock_create_thread = self.create_thread_patcher.start()
        self.addCleanup(self.create_thread_patcher.stop)

        self.thread_exists_patcher = patch("backend.routes.chat.thread_exists")
        self.mock_thread_exists = self.thread_exists_patcher.start()
        self.addCleanup(self.thread_exists_patcher.stop)

        self.should_append_patcher = patch(
            "backend.routes.chat.should_append_user_message"
        )
        self.mock_should_append = self.should_append_patcher.start()
        self.addCleanup(self.should_append_patcher.stop)

        self.should_append_thread_patcher = patch(
            "backend.routes.chat.should_append_thread_user_message"
        )
        self.mock_should_append_thread = self.should_append_thread_patcher.start()
        self.addCleanup(self.should_append_thread_patcher.stop)

        self.load_patcher = patch("backend.routes.chat.load_conversation")
        self.mock_load = self.load_patcher.start()
        self.addCleanup(self.load_patcher.stop)

        self.clear_patcher = patch("backend.routes.chat.clear_conversation")
        self.mock_clear = self.clear_patcher.start()
        self.addCleanup(self.clear_patcher.stop)

        self.grammar_patcher = patch("backend.routes.chat.check_user_grammar")
        self.mock_grammar = self.grammar_patcher.start()
        self.addCleanup(self.grammar_patcher.stop)

        self.record_tokens_patcher = patch("backend.routes.chat.record_token_usage")
        self.mock_record_tokens = self.record_tokens_patcher.start()
        self.addCleanup(self.record_tokens_patcher.stop)

        self.challenge_reply_patcher = patch(
            "backend.routes.chat.generate_challenge_reply"
        )
        self.mock_challenge_reply = self.challenge_reply_patcher.start()
        self.addCleanup(self.challenge_reply_patcher.stop)

        self.load_tasks_patcher = patch("backend.routes.chat.load_completed_task_ids")
        self.mock_load_tasks = self.load_tasks_patcher.start()
        self.addCleanup(self.load_tasks_patcher.stop)

        self.save_tasks_patcher = patch("backend.routes.chat.save_completed_task_ids")
        self.mock_save_tasks = self.save_tasks_patcher.start()
        self.addCleanup(self.save_tasks_patcher.stop)

        self.copy_conversation_patcher = patch("backend.routes.chat.copy_conversation")
        self.mock_copy_conversation = self.copy_conversation_patcher.start()
        self.addCleanup(self.copy_conversation_patcher.stop)

        self.clear_tasks_patcher = patch("backend.routes.chat.clear_completed_task_ids")
        self.mock_clear_tasks = self.clear_tasks_patcher.start()
        self.addCleanup(self.clear_tasks_patcher.stop)

        self.mark_completed_patcher = patch(
            "backend.routes.chat.mark_challenge_completed"
        )
        self.mock_mark_completed = self.mark_completed_patcher.start()
        self.addCleanup(self.mark_completed_patcher.stop)

        self.clear_progress_patcher = patch(
            "backend.routes.chat.clear_challenge_progress"
        )
        self.mock_clear_progress = self.clear_progress_patcher.start()
        self.addCleanup(self.clear_progress_patcher.stop)

        self.queue_summary_patcher = patch(
            "backend.routes.chat.queue_conversation_summary"
        )
        self.mock_queue_summary = self.queue_summary_patcher.start()
        self.addCleanup(self.queue_summary_patcher.stop)

        self.delete_summaries_patcher = patch(
            "backend.routes.chat.delete_conversation_summaries"
        )
        self.mock_delete_summaries = self.delete_summaries_patcher.start()
        self.addCleanup(self.delete_summaries_patcher.stop)

        self.mock_generate.reset_mock()
        self.mock_append.reset_mock()
        self.mock_append_thread.reset_mock()
        self.mock_create_thread.reset_mock()
        self.mock_thread_exists.reset_mock()
        self.mock_should_append.reset_mock()
        self.mock_should_append_thread.reset_mock()
        self.mock_load.reset_mock()
        self.mock_clear.reset_mock()
        self.mock_grammar.reset_mock()
        self.mock_record_tokens.reset_mock()
        self.mock_challenge_reply.reset_mock()
        self.mock_load_tasks.reset_mock()
        self.mock_save_tasks.reset_mock()
        self.mock_copy_conversation.reset_mock()
        self.mock_clear_tasks.reset_mock()
        self.mock_mark_completed.reset_mock()
        self.mock_clear_progress.reset_mock()
        self.mock_queue_summary.reset_mock()
        self.mock_delete_summaries.reset_mock()
        self.mock_should_append.return_value = True
        self.mock_should_append_thread.return_value = True
        self.mock_thread_exists.return_value = True
        self.mock_load_tasks.return_value = []
        self.mock_challenge_reply.return_value = MagicMock(
            content="您好",
            unknown_characters=[],
            completed_task_ids=[],
            judge_conversation=[],
            token_usage=MagicMock(input_tokens=0, output_tokens=0),
        )
        self.mock_grammar.return_value = MagicMock(
            severity="none",
            answer=None,
            needs_explanation=False,
            token_usage=MagicMock(input_tokens=0, output_tokens=0),
            to_dict=MagicMock(return_value={"severity": "none"}),
        )

    def test_chat_returns_assistant_message(self):
        self.mock_generate.return_value = MagicMock(
            content="你好，很高兴认识你。",
            unknown_characters=[],
            token_usage=MagicMock(input_tokens=30, output_tokens=12),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "message": {
                    "role": "assistant",
                    "content": "你好，很高兴认识你。",
                },
                "tokens": {"input": 30, "output": 12, "total": 42},
            },
        )
        self.mock_generate.assert_called_once_with(
            TEST_USER_ID,
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )
        self.mock_append.assert_any_call(
            TEST_USER_ID,
            "teacher-wang",
            "user",
            "你好",
            correction_thread_id=None,
            correction_severity=None,
        )
        self.mock_append.assert_any_call(
            TEST_USER_ID,
            "teacher-wang",
            "assistant",
            "你好，很高兴认识你。",
        )
        self.mock_grammar.assert_not_called()
        self.mock_create_thread.assert_not_called()
        self.mock_record_tokens.assert_called_once_with(
            TEST_USER_ID,
            input_tokens=30,
            output_tokens=12,
        )

    def test_chat_queues_summary_every_five_messages(self):
        self.mock_generate.return_value = MagicMock(
            content="好的。",
            unknown_characters=[],
            token_usage=MagicMock(input_tokens=1, output_tokens=1),
        )
        messages = [
            {"role": "user", "content": "1"},
            {"role": "assistant", "content": "2"},
            {"role": "user", "content": "3"},
            {"role": "assistant", "content": "4"},
            {"role": "user", "content": "5"},
        ]

        response = self.client.post(
            "/chat",
            json={"character_id": "teacher-wang", "messages": messages},
        )

        self.assertEqual(response.status_code, 200)
        self.mock_queue_summary.assert_called_once()
        args = self.mock_queue_summary.call_args.args
        self.assertEqual(args[1], TEST_USER_ID)
        self.assertEqual(args[2], TEST_USER_ID)
        self.assertEqual(args[3], "teacher-wang")

    def test_chat_does_not_queue_summary_off_multiple_of_five(self):
        self.mock_generate.return_value = MagicMock(
            content="好的。",
            unknown_characters=[],
            token_usage=MagicMock(input_tokens=1, output_tokens=1),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_queue_summary.assert_not_called()

    def test_chat_omits_final_prompt_by_default(self):
        self.mock_generate.return_value = MagicMock(
            content="你好，很高兴认识你。",
            unknown_characters=[],
            system_prompt="teacher wang system prompt",
            token_usage=MagicMock(input_tokens=30, output_tokens=12),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("final_prompt", response.get_json())

    def test_chat_includes_final_prompt_when_debug_mode_true(self):
        self.mock_generate.return_value = MagicMock(
            content="你好，很高兴认识你。",
            unknown_characters=[],
            system_prompt="teacher wang system prompt",
            token_usage=MagicMock(input_tokens=30, output_tokens=12),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
                "debug_mode": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["final_prompt"], "teacher wang system prompt"
        )

    def test_chat_includes_behaviors_when_debug_mode_true(self):
        self.mock_generate.return_value = MagicMock(
            content="你好，很高兴认识你。",
            unknown_characters=[],
            system_prompt="teacher wang system prompt",
            token_usage=MagicMock(input_tokens=30, output_tokens=12),
            behavior_ids=["BHV-01", "BHV-10"],
            behavior_failures=["BHV-10"],
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
                "debug_mode": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["behaviors"],
            {"selected": ["BHV-01", "BHV-10"], "failed": ["BHV-10"]},
        )

    def test_chat_omits_behaviors_when_none_selected(self):
        self.mock_generate.return_value = MagicMock(
            content="你好，很高兴认识你。",
            unknown_characters=[],
            system_prompt="teacher wang system prompt",
            token_usage=MagicMock(input_tokens=30, output_tokens=12),
            behavior_ids=[],
            behavior_failures=[],
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
                "debug_mode": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("behaviors", response.get_json())

    def test_chat_rejects_non_boolean_debug_mode(self):
        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
                "debug_mode": "yes",
            },
        )

        self.assertEqual(response.status_code, 400)

    @patch("backend.routes.chat.current_user")
    def test_chat_debug_mode_defaults_true_for_admin_email(self, mock_current_user):
        mock_current_user.return_value = MagicMock(
            id=TEST_USER_ID, email="mazarsju@gmail.com"
        )
        self.mock_generate.return_value = MagicMock(
            content="你好，很高兴认识你。",
            unknown_characters=[],
            system_prompt="teacher wang system prompt",
            token_usage=MagicMock(input_tokens=30, output_tokens=12),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["final_prompt"], "teacher wang system prompt"
        )

    def test_chat_includes_correction_thread_for_non_teacher_chats(self):
        self.mock_generate.return_value = MagicMock(
            content="我也很好！",
            unknown_characters=[],
            token_usage=MagicMock(input_tokens=50, output_tokens=30),
        )
        self.mock_grammar.return_value = MagicMock(
            severity="incorrect",
            answer="Say 我很好 instead of 我是很好.",
            needs_explanation=True,
            token_usage=MagicMock(input_tokens=20, output_tokens=5),
            to_dict=MagicMock(
                return_value={
                    "severity": "incorrect",
                    "answer": "Say 我很好 instead of 我是很好.",
                }
            ),
        )
        thread_messages = [
            {
                "role": "assistant",
                "content": "Say 我很好 instead of 我是很好.",
            }
        ]
        self.mock_create_thread.return_value = ("thread123", thread_messages)

        response = self.client.post(
            "/chat",
            json={
                "character_id": "xiao-ming",
                "messages": [{"role": "user", "content": "我是很好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "message": {
                    "role": "assistant",
                    "content": "我也很好！",
                },
                "correction": {
                    "severity": "incorrect",
                    "answer": "Say 我很好 instead of 我是很好.",
                    "thread_id": "thread123",
                    "thread_messages": thread_messages,
                },
                "tokens": {"input": 70, "output": 35, "total": 105},
            },
        )
        self.mock_grammar.assert_called_once_with(TEST_USER_ID, "我是很好", None)
        self.mock_create_thread.assert_called_once_with(
            TEST_USER_ID,
            "xiao-ming",
            "Say 我很好 instead of 我是很好.",
        )
        self.mock_append.assert_any_call(
            TEST_USER_ID,
            "xiao-ming",
            "user",
            "我是很好",
            correction_thread_id="thread123",
            correction_severity="incorrect",
        )
        self.mock_append.assert_any_call(
            TEST_USER_ID,
            "xiao-ming",
            "assistant",
            "我也很好！",
        )
        self.assertEqual(self.mock_append.call_count, 2)
        self.mock_record_tokens.assert_called_once_with(
            TEST_USER_ID,
            input_tokens=70,
            output_tokens=35,
        )

    def test_chat_passes_previous_assistant_message_to_grammar_check(self):
        self.mock_generate.return_value = MagicMock(
            content="好的！",
            unknown_characters=[],
            token_usage=MagicMock(input_tokens=50, output_tokens=30),
        )
        self.mock_grammar.return_value = MagicMock(
            severity="none",
            needs_explanation=False,
            token_usage=MagicMock(input_tokens=20, output_tokens=5),
        )

        self.client.post(
            "/chat",
            json={
                "character_id": "xiao-ming",
                "messages": [
                    {"role": "assistant", "content": "你要香草还是巧克力？"},
                    {"role": "user", "content": "巧克力"},
                ],
            },
        )

        self.mock_grammar.assert_called_once_with(
            TEST_USER_ID, "巧克力", "你要香草还是巧克力？"
        )

    def test_thread_chat_stores_messages_under_parent_conversation(self):
        self.mock_generate.return_value = MagicMock(
            content="Because 是 is not used that way.",
            unknown_characters=[],
            token_usage=MagicMock(input_tokens=20, output_tokens=13),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "parent_character_id": "xiao-ming",
                "thread_id": "thread123",
                "messages": [
                    {
                        "role": "assistant",
                        "content": "Say 我很好 instead of 我是很好.",
                    },
                    {"role": "user", "content": "Why?"},
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "message": {
                    "role": "assistant",
                    "content": "Because 是 is not used that way.",
                },
                "tokens": {"input": 20, "output": 13, "total": 33},
            },
        )
        self.mock_grammar.assert_not_called()
        self.mock_append.assert_not_called()
        self.mock_append_thread.assert_any_call(
            TEST_USER_ID,
            "xiao-ming",
            "thread123",
            "user",
            "Why?",
        )
        self.mock_append_thread.assert_any_call(
            TEST_USER_ID,
            "xiao-ming",
            "thread123",
            "assistant",
            "Because 是 is not used that way.",
        )
        self.mock_record_tokens.assert_called_once_with(
            TEST_USER_ID,
            input_tokens=20,
            output_tokens=13,
        )

    def test_thread_chat_rejects_non_teacher_character(self):
        response = self.client.post(
            "/chat",
            json={
                "character_id": "xiao-ming",
                "parent_character_id": "xiao-ming",
                "thread_id": "thread123",
                "messages": [{"role": "user", "content": "Why?"}],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.mock_generate.assert_not_called()

    def test_chat_includes_unknown_characters_when_rephrase_fails(self):
        self.mock_generate.return_value = MagicMock(
            content="你好啊",
            unknown_characters=[["世", "界"], ["啊"]],
            token_usage=MagicMock(input_tokens=8, output_tokens=4),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "teacher-wang",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "message": {
                    "role": "assistant",
                    "content": "你好啊",
                },
                "unknown_characters": [["世", "界"], ["啊"]],
                "tokens": {"input": 8, "output": 4, "total": 12},
            },
        )

    def test_chat_rejects_invalid_character_id(self):
        response = self.client.post(
            "/chat",
            json={
                "character_id": "unknown",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.mock_generate.assert_not_called()
        self.mock_append.assert_not_called()

    def test_chat_returns_service_error(self):
        self.mock_generate.side_effect = ValueError("LLM_API_KEY must be set")

        response = self.client.post(
            "/chat",
            json={
                "character_id": "xiao-ming",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": "LLM_API_KEY must be set"},
        )
        self.mock_append.assert_called_once_with(
            TEST_USER_ID,
            "xiao-ming",
            "user",
            "你好",
            correction_thread_id=None,
            correction_severity="none",
        )

    def test_chat_returns_free_plan_token_exhausted_message(self):
        from backend.utils.database.settings import FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE

        self.mock_generate.side_effect = ValueError(
            FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "xiao-ming",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"error": FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE},
        )

    def test_chat_history_returns_saved_messages(self):
        self.mock_load.return_value = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "你好"},
        ]

        response = self.client.get("/chat/history/teacher-wang")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "messages": [
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "你好"},
                ]
            },
        )
        self.mock_load.assert_called_once_with(TEST_USER_ID, "teacher-wang")

    def test_challenge_chat_returns_completed_task_ids(self):
        self.mock_challenge_reply.return_value = MagicMock(
            content="您好，请稍等。",
            unknown_characters=[],
            completed_task_ids=["call-waiter"],
            judge_conversation=[],
            token_usage=MagicMock(input_tokens=35, output_tokens=15),
        )
        self.mock_load_tasks.return_value = []

        response = self.client.post(
            "/chat",
            json={
                "character_id": "challenge-restaurant",
                "messages": [{"role": "user", "content": "服务员！"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["completed_task_ids"], ["call-waiter"])
        self.assertNotIn("judge_conversation", payload)
        self.mock_challenge_reply.assert_called_once()
        self.mock_generate.assert_not_called()
        self.mock_save_tasks.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
            ["call-waiter"],
        )
        self.mock_record_tokens.assert_called_once_with(
            TEST_USER_ID,
            input_tokens=35,
            output_tokens=15,
        )

    def test_challenge_completion_hands_history_to_unlocked_character(self):
        self.mock_challenge_reply.return_value = MagicMock(
            content="哦，你18岁啊。",
            unknown_characters=[],
            completed_task_ids=["say-age"],
            judge_conversation=[],
            token_usage=MagicMock(input_tokens=10, output_tokens=5),
        )
        self.mock_load_tasks.return_value = [
            "greet-friend",
            "introduce-name",
        ]

        response = self.client.post(
            "/chat",
            json={
                "character_id": "challenge-new-friend",
                "messages": [{"role": "user", "content": "我18岁"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_mark_completed.assert_called_once_with(
            TEST_USER_ID,
            "challenge-new-friend",
        )
        self.mock_copy_conversation.assert_called_once_with(
            TEST_USER_ID,
            "challenge-new-friend",
            "xiao-ming",
        )

    def test_challenge_in_progress_does_not_hand_off_history(self):
        self.mock_challenge_reply.return_value = MagicMock(
            content="你好！很高兴认识你。",
            unknown_characters=[],
            completed_task_ids=["greet-friend"],
            judge_conversation=[],
            token_usage=MagicMock(input_tokens=10, output_tokens=5),
        )
        self.mock_load_tasks.return_value = []

        response = self.client.post(
            "/chat",
            json={
                "character_id": "challenge-new-friend",
                "messages": [{"role": "user", "content": "你好"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_mark_completed.assert_not_called()
        self.mock_copy_conversation.assert_not_called()

    def test_challenge_completion_without_unlock_mapping_does_not_hand_off(self):
        self.mock_challenge_reply.return_value = MagicMock(
            content="谢谢惠顾。",
            unknown_characters=[],
            completed_task_ids=["pay-bill"],
            judge_conversation=[],
            token_usage=MagicMock(input_tokens=10, output_tokens=5),
        )
        self.mock_load_tasks.return_value = [
            "call-waiter",
            "ask-no-meat",
            "ask-bill",
        ]

        response = self.client.post(
            "/chat",
            json={
                "character_id": "challenge-restaurant",
                "messages": [{"role": "user", "content": "谢谢"}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.mock_mark_completed.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
        )
        self.mock_copy_conversation.assert_not_called()

    def test_challenge_chat_returns_judge_conversation_when_revised(self):
        self.mock_challenge_reply.return_value = MagicMock(
            content="请先点菜。",
            unknown_characters=[],
            completed_task_ids=[],
            judge_conversation=[
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
            system_prompt="challenge system prompt",
            token_usage=MagicMock(input_tokens=40, output_tokens=20),
        )

        response = self.client.post(
            "/chat",
            json={
                "character_id": "challenge-restaurant",
                "messages": [{"role": "user", "content": "买单"}],
                "debug_mode": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["message"]["content"], "请先点菜。")
        self.assertEqual(payload["final_prompt"], "challenge system prompt")
        self.assertEqual(
            payload["judge_conversation"],
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
        self.mock_append.assert_any_call(
            TEST_USER_ID,
            "challenge-restaurant",
            "assistant",
            "请先点菜。",
        )

    def test_challenge_chat_history_includes_completed_task_ids(self):
        self.mock_load.return_value = [
            {"role": "user", "content": "服务员"},
        ]
        self.mock_load_tasks.return_value = ["call-waiter"]

        response = self.client.get("/chat/history/challenge-restaurant")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "messages": [{"role": "user", "content": "服务员"}],
                "completed_task_ids": ["call-waiter"],
            },
        )

    def test_clear_challenge_history_also_clears_task_progress(self):
        response = self.client.delete("/chat/history/challenge-restaurant")

        self.assertEqual(response.status_code, 200)
        self.mock_clear.assert_called_once_with(TEST_USER_ID, "challenge-restaurant")
        self.mock_clear_tasks.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
        )
        self.mock_clear_progress.assert_called_once_with(
            TEST_USER_ID,
            "challenge-restaurant",
        )

    def test_chat_history_rejects_invalid_character_id(self):
        response = self.client.get("/chat/history/unknown")

        self.assertEqual(response.status_code, 400)
        self.mock_load.assert_not_called()

    def test_clear_chat_history_deletes_conversation(self):
        response = self.client.delete("/chat/history/teacher-wang")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"message": "Chat history cleared"},
        )
        self.mock_clear.assert_called_once_with(TEST_USER_ID, "teacher-wang")
        self.mock_delete_summaries.assert_called_once_with(TEST_USER_ID, "teacher-wang")

    def test_clear_chat_history_rejects_invalid_character_id(self):
        response = self.client.delete("/chat/history/unknown")

        self.assertEqual(response.status_code, 400)
        self.mock_clear.assert_not_called()
        self.mock_delete_summaries.assert_not_called()


if __name__ == "__main__":
    unittest.main()
