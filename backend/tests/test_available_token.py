import bootstrap  # noqa: F401
import unittest
from unittest.mock import MagicMock, patch

from backend.chat_service import LlmTokenUsage, _invoke_llm
from backend.extensions import db
from backend.settings import (
    FREE_PLAN_MAX_ALLOWED_TOKEN,
    FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE,
    SETTING_AVAILABLE_TOKEN,
    assert_free_plan_has_tokens,
    deduct_available_token,
    ensure_default_settings,
    get_available_token,
    set_setting,
)
from postgres_test_case import PostgresTestCase


class TestAvailableTokenHelpers(PostgresTestCase):
    def test_default_available_token_is_seeded(self):
        ensure_default_settings(self.user_id)
        self.assertEqual(get_available_token(self.user_id), FREE_PLAN_MAX_ALLOWED_TOKEN)

    def test_assert_blocks_when_remaining_is_not_positive(self):
        ensure_default_settings(self.user_id)
        set_setting(self.user_id, SETTING_AVAILABLE_TOKEN, "0", commit=True)

        with self.assertRaises(ValueError) as ctx:
            assert_free_plan_has_tokens(self.user)

        self.assertEqual(str(ctx.exception), FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE)

    def test_assert_allows_paid_plan_with_zero_tokens(self):
        ensure_default_settings(self.user_id)
        set_setting(self.user_id, SETTING_AVAILABLE_TOKEN, "0", commit=True)
        self.user.plan = "paid"
        db.session.commit()

        assert_free_plan_has_tokens(self.user)

    def test_deduct_available_token_can_go_negative(self):
        ensure_default_settings(self.user_id)
        set_setting(self.user_id, SETTING_AVAILABLE_TOKEN, "10", commit=True)

        remaining = deduct_available_token(self.user_id, 25, commit=True)

        self.assertEqual(remaining, -15)
        self.assertEqual(get_available_token(self.user_id), -15)


class TestInvokeLlmTokenGate(PostgresTestCase):
    def test_invoke_llm_deducts_for_free_plan(self):
        ensure_default_settings(self.user_id)
        set_setting(
            self.user_id,
            SETTING_AVAILABLE_TOKEN,
            str(FREE_PLAN_MAX_ALLOWED_TOKEN),
            commit=True,
        )

        mock_response = MagicMock()
        mock_response.content = "你好"
        mock_response.usage_metadata = {"input_tokens": 20, "output_tokens": 5}
        mock_response.response_metadata = {}

        with patch(
            "backend.user_context.current_user",
            return_value=self.user,
        ), patch("backend.chat_service.get_llm") as mock_get_llm:
            mock_get_llm.return_value.invoke.return_value = mock_response
            text, usage = _invoke_llm([])

        self.assertEqual(text, "你好")
        self.assertEqual(usage, LlmTokenUsage(input_tokens=20, output_tokens=5))
        self.assertEqual(
            get_available_token(self.user_id),
            FREE_PLAN_MAX_ALLOWED_TOKEN - 25,
        )

    def test_invoke_llm_rejects_when_free_plan_exhausted(self):
        ensure_default_settings(self.user_id)
        set_setting(self.user_id, SETTING_AVAILABLE_TOKEN, "0", commit=True)

        with patch(
            "backend.user_context.current_user",
            return_value=self.user,
        ), patch("backend.chat_service.get_llm") as mock_get_llm:
            with self.assertRaises(ValueError) as ctx:
                _invoke_llm([])

        self.assertEqual(str(ctx.exception), FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE)
        mock_get_llm.assert_not_called()


if __name__ == "__main__":
    unittest.main()
