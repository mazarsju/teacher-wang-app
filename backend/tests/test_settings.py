import bootstrap  # noqa: F401
import unittest

from backend.models import Setting
from backend.settings import (
    DEFAULT_SETTINGS,
    FREE_PLAN_MAX_ALLOWED_TOKEN,
    PRO_PLAN_TOKEN_GRANT,
    SETTING_AVAILABLE_TOKEN,
    SETTING_LEVEL,
    ensure_default_settings,
    get_setting,
    get_smart_ai_enabled,
    reset_available_token,
    set_setting,
    set_smart_ai_enabled,
)
from postgres_test_case import PostgresTestCase, create_test_user


class TestSettings(PostgresTestCase):
    def test_ensure_default_settings_creates_level_and_anki_decks(self):
        ensure_default_settings(self.user_id)
        self.assertEqual(Setting.query.count(), len(DEFAULT_SETTINGS))
        self.assertEqual(get_setting(self.user_id, SETTING_LEVEL), "")
        self.assertEqual(
            get_setting(self.user_id, "anki_synchronization_status"),
            "not_synchronized",
        )
        self.assertEqual(get_setting(self.user_id, "anki_mandarin_vocabulary_deck"), "")
        self.assertEqual(get_setting(self.user_id, "anki_mandarin_writing_deck"), "")
        self.assertEqual(
            get_setting(self.user_id, SETTING_AVAILABLE_TOKEN),
            str(FREE_PLAN_MAX_ALLOWED_TOKEN),
        )

    def test_settings_are_isolated_per_user(self):
        other = create_test_user("other-user", "other", "other@example.com")
        set_setting(self.user_id, SETTING_LEVEL, "3", commit=True)
        set_setting(other.shortid, SETTING_LEVEL, "5", commit=True)

        self.assertEqual(get_setting(self.user_id, SETTING_LEVEL), "3")
        self.assertEqual(get_setting(other.shortid, SETTING_LEVEL), "5")
        self.assertEqual(get_setting(-1, SETTING_LEVEL, "none"), "none")

    def test_reset_available_token_grants_plan_allowance(self):
        set_setting(self.user_id, SETTING_AVAILABLE_TOKEN, "0", commit=True)

        reset_available_token(self.user_id, "free", commit=True)
        self.assertEqual(
            get_setting(self.user_id, SETTING_AVAILABLE_TOKEN),
            str(FREE_PLAN_MAX_ALLOWED_TOKEN),
        )

        reset_available_token(self.user_id, "pro", commit=True)
        self.assertEqual(
            get_setting(self.user_id, SETTING_AVAILABLE_TOKEN),
            str(PRO_PLAN_TOKEN_GRANT),
        )

    def test_smart_ai_defaults_to_enabled(self):
        self.assertTrue(get_smart_ai_enabled(self.user_id))

    def test_smart_ai_can_be_disabled_and_reenabled(self):
        set_smart_ai_enabled(self.user_id, False)
        self.assertFalse(get_smart_ai_enabled(self.user_id))

        set_smart_ai_enabled(self.user_id, True)
        self.assertTrue(get_smart_ai_enabled(self.user_id))

    def test_smart_ai_setting_is_isolated_per_user(self):
        other = create_test_user("other-user", "other", "other@example.com")
        set_smart_ai_enabled(self.user_id, False)
        set_smart_ai_enabled(other.shortid, True)

        self.assertFalse(get_smart_ai_enabled(self.user_id))
        self.assertTrue(get_smart_ai_enabled(other.shortid))


if __name__ == "__main__":
    unittest.main()
