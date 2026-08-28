import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

import backend.utils.database.database as database_module

database_module.init_db = MagicMock()
database_module.configure_database = MagicMock()

from backend.utils.aiChat.behavior_spec import ALWAYS_ON_BEHAVIOR_IDS, get_behavior  # noqa: E402
from backend.utils.aiChat.chat_service import (  # noqa: E402
    BEHAVIOR_CHECK_ENABLED,
    GrammarCorrection,
    GrammarUsageResult,
    LlmTokenUsage,
    TopicRelevanceResult,
    check_grammar_usage,
    check_user_grammar,
    check_writing_topic_relevance,
    find_unknown_characters,
    generate_chat_reply,
    select_behaviors,
    validate_behaviors,
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
            "backend.utils.auth.user_context.current_user",
            return_value=MagicMock(id="test-user", plan="free", language="en"),
        )
        self.assert_tokens_patcher = patch(
            "backend.utils.database.settings.assert_free_plan_has_tokens"
        )
        self.deduct_tokens_patcher = patch(
            "backend.utils.database.settings.deduct_available_token"
        )
        self.current_user_patcher.start()
        self.assert_tokens_patcher.start()
        self.deduct_tokens_patcher.start()
        self.addCleanup(self.current_user_patcher.stop)
        self.addCleanup(self.assert_tokens_patcher.stop)
        self.addCleanup(self.deduct_tokens_patcher.stop)


class TestGenerateChatReply(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=True)
    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_generate_chat_reply_returns_assistant_message(
        self,
        mock_get_llm,
        _mock_speaking_level,
        mock_character_cls,
        _mock_smart_ai_enabled,
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(char="你"),
            MagicMock(char="好"),
        ]
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(content='{"behavior_ids": ["BHV-01"]}'),
            MagicMock(content="你好！"),
            MagicMock(content='{"failures": []}'),
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(reply.content, "你好！")
        self.assertEqual(reply.unknown_characters, [])
        self.assertEqual(reply.behavior_ids, [*ALWAYS_ON_BEHAVIOR_IDS, "BHV-01"])
        self.assertEqual(reply.behavior_failures, [])
        if (BEHAVIOR_CHECK_ENABLED):
            self.assertEqual(mock_llm.invoke.call_count, 3)
        else:
            self.assertEqual(mock_llm.invoke.call_count, 2)

        planner_messages = mock_llm.invoke.call_args_list[0].args[0]
        self.assertIn("Behavior Planner", planner_messages[0].content)
        self.assertIn("BHV-01", planner_messages[0].content)

        generator_messages = mock_llm.invoke.call_args_list[1].args[0]
        self.assertIn("Teacher Wang", generator_messages[0].content)
        self.assertIn(
            "Teaching strategy for HSK 3 (Balanced bilingual teaching)",
            generator_messages[0].content,
        )
        self.assertIn("Direct Question Answering", generator_messages[0].content)
        self.assertEqual(generator_messages[1].content, "你好")
        self.assertEqual(reply.system_prompt, generator_messages[0].content)

        if (BEHAVIOR_CHECK_ENABLED):
            validator_messages = mock_llm.invoke.call_args_list[2].args[0]
            self.assertIn("Behavior Validator", validator_messages[0].content)

        planner_prompt = planner_messages[1].content
        self.assertIn("Teaching strategy for HSK 3", planner_prompt)

    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.utils.aiChat.chat_service.get_llm")
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

        self.assertEqual(reply.content, "你好！")
        self.assertEqual(reply.unknown_characters, [])
        self.assertEqual(
            reply.token_usage, LlmTokenUsage(input_tokens=22, output_tokens=7)
        )
        self.assertEqual(mock_llm.invoke.call_count, 2)
        rephrase_prompt = mock_llm.invoke.call_args_list[1].args[0][-1].content
        self.assertIn("世", rephrase_prompt)
        self.assertIn("界", rephrase_prompt)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=True)
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_skips_retry_when_disabled_for_character(
        self, mock_get_llm, _mock_speaking_level, _mock_smart_ai_enabled
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(content='{"behavior_ids": []}'),
            MagicMock(content="你好世界"),
            MagicMock(content='{"failures": []}'),
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(reply.content, "你好世界")
        self.assertEqual(reply.unknown_characters, [])
        # The planner selected nothing, but always-on behaviors still apply.
        self.assertEqual(reply.behavior_ids, list(ALWAYS_ON_BEHAVIOR_IDS))
        self.assertEqual(reply.behavior_failures, [])
        self.assertEqual(mock_llm.invoke.call_count, 2)

    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.utils.aiChat.chat_service.get_llm")
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

        self.assertEqual(reply.content, "你好啊")
        self.assertEqual(
            reply.unknown_characters,
            [
                ["世", "界"],
                ["啊"],
                ["吗", "呢"],
                ["世", "啊", "界"],
            ],
        )
        self.assertEqual(mock_llm.invoke.call_count, 4)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=True)
    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_always_on_behaviors_apply_even_when_planner_omits_them(
        self,
        mock_get_llm,
        _mock_speaking_level,
        mock_character_cls,
        _mock_smart_ai_enabled,
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = []
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(content='{"behavior_ids": []}'),
            MagicMock(content="你好！"),
            MagicMock(content='{"failures": []}'),
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(reply.behavior_ids, list(ALWAYS_ON_BEHAVIOR_IDS))
        for always_on_id in ALWAYS_ON_BEHAVIOR_IDS:
            self.assertIn(get_behavior(always_on_id)["title"], reply.system_prompt)

        if (BEHAVIOR_CHECK_ENABLED):
            validator_prompt = mock_llm.invoke.call_args_list[2].args[0][-1].content
            for always_on_id in ALWAYS_ON_BEHAVIOR_IDS:
                self.assertIn(always_on_id, validator_prompt)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=True)
    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_retries_once_and_keeps_improved_attempt(
        self,
        mock_get_llm,
        _mock_speaking_level,
        mock_character_cls,
        _mock_smart_ai_enabled,
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = []
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(content='{"behavior_ids": ["BHV-01"]}'),
            MagicMock(content="故事是这样的...你好"),
            MagicMock(
                content=(
                    '{"failures": [{"id": "BHV-01", "reason": '
                    '"The answer came after an unrelated story instead of '
                    'first."}]}'
                )
            ),
            MagicMock(content="你好！"),
            MagicMock(content='{"failures": []}'),
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(reply.content, "故事是这样的...你好")
        if (BEHAVIOR_CHECK_ENABLED):
            self.assertEqual(reply.behavior_failures, [])
            self.assertEqual(mock_llm.invoke.call_count, 5)
        else:
            self.assertEqual(reply.behavior_failures, [])
            self.assertEqual(mock_llm.invoke.call_count, 2)

        if (BEHAVIOR_CHECK_ENABLED):
            revision_prompt = mock_llm.invoke.call_args_list[3].args[0][-1].content
            self.assertIn("Behavior Validator found problems", revision_prompt)
            self.assertIn("unrelated story instead of first", revision_prompt)
            self.assertIn("Direct Question Answering", revision_prompt)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=True)
    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_retry_keeps_original_when_revision_does_not_improve(
        self,
        mock_get_llm,
        _mock_speaking_level,
        mock_character_cls,
        _mock_smart_ai_enabled,
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = []
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = [
            MagicMock(content='{"behavior_ids": ["BHV-01"]}'),
            MagicMock(content="original reply"),
            MagicMock(
                content='{"failures": [{"id": "BHV-01", "reason": "still off."}]}'
            ),
            MagicMock(content="revised reply, still not fixed"),
            MagicMock(
                content='{"failures": [{"id": "BHV-01", "reason": "still off."}]}'
            ),
        ]
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(reply.content, "original reply")
        if (BEHAVIOR_CHECK_ENABLED):
            self.assertEqual(reply.behavior_failures, ["BHV-01"])
            self.assertEqual(mock_llm.invoke.call_count, 5)
        else:
            self.assertEqual(reply.behavior_failures, [])
            self.assertEqual(mock_llm.invoke.call_count, 2)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=False)
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_skips_planner_and_validator_when_smart_ai_disabled(
        self, mock_get_llm, _mock_speaking_level, _mock_smart_ai_enabled
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="你好！")
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        self.assertEqual(reply.content, "你好！")
        self.assertEqual(reply.behavior_ids, [])
        self.assertEqual(reply.behavior_failures, [])
        mock_llm.invoke.assert_called_once()

        system_prompt = mock_llm.invoke.call_args.args[0][0].content
        self.assertIn("Teacher Wang", system_prompt)
        self.assertIn("Teaching strategy for HSK 3", system_prompt)
        self.assertNotIn("Apply these teaching requirements", system_prompt)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=False)
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_injects_summary_context_into_system_prompt(
        self, mock_get_llm, _mock_speaking_level, _mock_smart_ai_enabled
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="你好！")
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
            summary_context={"teaching_context": {"current_topic": "greetings"}},
        )

        system_prompt = mock_llm.invoke.call_args.args[0][0].content
        self.assertIn("Conversation memory", system_prompt)
        self.assertIn("greetings", system_prompt)
        self.assertEqual(reply.system_prompt, system_prompt)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=False)
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_injects_topic_context_into_system_prompt(
        self, mock_get_llm, _mock_speaking_level, _mock_smart_ai_enabled
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="是 links two nouns.")
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "Can you explain more?"}],
            topic_context="# The verb 是\n是 means 'to be' and links two nouns.",
        )

        system_prompt = mock_llm.invoke.call_args.args[0][0].content
        self.assertIn("one specific grammar lesson", system_prompt)
        self.assertIn("The verb 是", system_prompt)
        self.assertEqual(reply.system_prompt, system_prompt)

    @patch("backend.utils.database.settings.get_smart_ai_enabled", return_value=False)
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=3)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_omits_topic_context_block_when_not_given(
        self, mock_get_llm, _mock_speaking_level, _mock_smart_ai_enabled
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="你好！")
        mock_get_llm.return_value = mock_llm

        generate_chat_reply(
            "test-user",
            "teacher-wang",
            [{"role": "user", "content": "你好"}],
        )

        system_prompt = mock_llm.invoke.call_args.args[0][0].content
        self.assertNotIn("one specific grammar lesson", system_prompt)

    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_lists_known_characters_when_knowledge_base_is_small(
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
            "xiao-ming",
            [{"role": "user", "content": "你好"}],
        )

        self.assertIn("fewer than 250", reply.system_prompt)
        self.assertIn("你、好", reply.system_prompt)
        self.assertIn("Answer using only these characters", reply.system_prompt)

    @patch("backend.utils.aiChat.chat_service.Character")
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_skips_known_characters_list_once_knowledge_base_is_large(
        self, mock_get_llm, _mock_speaking_level, mock_character_cls
    ):
        mock_character_cls.query.filter_by.return_value.all.return_value = [
            MagicMock(char=f"字{i}") for i in range(250)
        ]
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content="你好！")
        mock_get_llm.return_value = mock_llm

        reply = generate_chat_reply(
            "test-user",
            "xiao-ming",
            [{"role": "user", "content": "你好"}],
        )

        self.assertNotIn("fewer than 250", reply.system_prompt)

    def test_generate_chat_reply_rejects_unknown_character(self):
        with self.assertRaises(ValueError):
            generate_chat_reply(
                "test-user",
                "unknown",
                [{"role": "user", "content": "你好"}],
            )

    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=1)
    def test_generate_chat_reply_requires_user_message_last(self, _mock_speaking_level):
        with self.assertRaises(ValueError):
            generate_chat_reply(
                "test-user",
                "xiao-ming",
                [{"role": "assistant", "content": "你好"}],
            )


class TestBehaviorPipeline(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_select_behaviors_dedupes_and_drops_unknown_ids(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"behavior_ids": ["BHV-01", "BHV-99", "BHV-01"]}'
        )
        mock_get_llm.return_value = mock_llm

        behavior_ids, _usage = select_behaviors("你好吗？")

        self.assertEqual(behavior_ids, ["BHV-01"])

    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_validate_behaviors_returns_failed_ids_and_reasons(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content=(
                '{"failures": [{"id": "BHV-02", "reason": '
                '"No English translation was given."}]}'
            )
        )
        mock_get_llm.return_value = mock_llm

        failed_ids, reasons, _usage = validate_behaviors(
            "reply text", ["BHV-01", "BHV-02"]
        )

        self.assertEqual(failed_ids, ["BHV-02"])
        self.assertEqual(reasons, {"BHV-02": "No English translation was given."})

    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_validate_behaviors_skips_llm_call_when_none_selected(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_get_llm.return_value = mock_llm

        failed_ids, reasons, usage = validate_behaviors("reply text", [])

        self.assertEqual(failed_ids, [])
        self.assertEqual(reasons, {})
        self.assertEqual(usage, LlmTokenUsage())
        mock_llm.invoke.assert_not_called()


class TestCheckUserGrammar(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=2)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_check_user_grammar_returns_none_when_correct(
        self, mock_get_llm, _mock_level
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content='{"severity": "none"}')
        mock_get_llm.return_value = mock_llm

        result = check_user_grammar("test-user", "你好")

        self.assertEqual(result, GrammarCorrection(severity="none"))
        invoked_messages = mock_llm.invoke.call_args.args[0]
        self.assertIn("Teacher Wang", invoked_messages[0].content)
        self.assertIn("JSON object", invoked_messages[0].content)
        self.assertEqual(invoked_messages[1].content, 'User response: "你好"')

    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=2)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_check_user_grammar_includes_previous_ai_message(
        self, mock_get_llm, _mock_level
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content='{"severity": "none"}')
        mock_get_llm.return_value = mock_llm

        check_user_grammar("test-user", "巧克力", "你要香草还是巧克力？")

        invoked_messages = mock_llm.invoke.call_args.args[0]
        self.assertEqual(
            invoked_messages[1].content,
            'AI character previous statement: "你要香草还是巧克力？", '
            'User response: "巧克力"',
        )

    @patch("backend.utils.knowledgeBase.hsk_level.get_chat_speaking_hsk_level", return_value=2)
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_check_user_grammar_returns_answer_when_incorrect(
        self, mock_get_llm, _mock_level
    ):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content=(
                '```json\n{"severity": "incorrect", '
                '"answer": "Use 我很好 instead."}\n```'
            )
        )
        mock_get_llm.return_value = mock_llm

        result = check_user_grammar("test-user", "我是很好")

        self.assertEqual(
            result,
            GrammarCorrection(
                severity="incorrect", answer="Use 我很好 instead."
            ),
        )
        self.assertEqual(
            result.to_dict(),
            {"severity": "incorrect", "answer": "Use 我很好 instead."},
        )


class TestCheckGrammarUsage(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_returns_covered_grammar_ids(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"covered_grammar_ids": ["g1"]}'
        )
        mock_get_llm.return_value = mock_llm

        result = check_grammar_usage(
            "我把书放下了",
            [{"id": "g1", "title": "Ba construction"}, {"id": "g2", "title": "Le aspect"}],
        )

        self.assertEqual(result, GrammarUsageResult(covered_grammar_ids=["g1"]))
        invoked_messages = mock_llm.invoke.call_args.args[0]
        self.assertIn("g1: Ba construction", invoked_messages[1].content)
        self.assertIn("我把书放下了", invoked_messages[1].content)

    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_ignores_ids_not_in_candidate_list(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"covered_grammar_ids": ["g1", "unknown"]}'
        )
        mock_get_llm.return_value = mock_llm

        result = check_grammar_usage(
            "我把书放下了", [{"id": "g1", "title": "Ba construction"}]
        )

        self.assertEqual(result.covered_grammar_ids, ["g1"])

    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_returns_empty_when_nothing_covered(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(
            content='{"covered_grammar_ids": []}'
        )
        mock_get_llm.return_value = mock_llm

        result = check_grammar_usage(
            "你好", [{"id": "g1", "title": "Ba construction"}]
        )

        self.assertEqual(result.covered_grammar_ids, [])

    def test_rejects_empty_text(self):
        with self.assertRaises(ValueError):
            check_grammar_usage("  ", [{"id": "g1", "title": "Ba construction"}])

    def test_rejects_empty_grammar_points(self):
        with self.assertRaises(ValueError):
            check_grammar_usage("你好", [])


class TestCheckWritingTopicRelevance(_FreePlanTokenMixin, unittest.TestCase):
    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_returns_on_topic_true(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content='{"on_topic": true}')
        mock_get_llm.return_value = mock_llm

        result = check_writing_topic_relevance("我叫小明，我是学生。", "Present yourself")

        self.assertEqual(result, TopicRelevanceResult(on_topic=True))
        invoked_messages = mock_llm.invoke.call_args.args[0]
        self.assertIn("Present yourself", invoked_messages[1].content)
        self.assertIn("我叫小明", invoked_messages[1].content)

    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_returns_on_topic_false(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content='{"on_topic": false}')
        mock_get_llm.return_value = mock_llm

        result = check_writing_topic_relevance("你好！", "Present yourself")

        self.assertEqual(result.on_topic, False)

    def test_rejects_empty_text(self):
        with self.assertRaises(ValueError):
            check_writing_topic_relevance("  ", "Present yourself")

    def test_rejects_empty_topic(self):
        with self.assertRaises(ValueError):
            check_writing_topic_relevance("你好", "  ")

    @patch("backend.utils.aiChat.chat_service.get_llm")
    def test_rejects_non_boolean_on_topic(self, mock_get_llm):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = MagicMock(content='{"on_topic": "yes"}')
        mock_get_llm.return_value = mock_llm

        with self.assertRaises(ValueError):
            check_writing_topic_relevance("你好", "Present yourself")


if __name__ == "__main__":
    unittest.main()
