import bootstrap  # noqa: F401
import unittest

from backend.models import Setting
from backend.settings import (
    DEFAULT_SETTINGS,
    FREE_PLAN_MAX_ALLOWED_TOKEN,
    SETTING_AVAILABLE_TOKEN,
    SETTING_LEVEL,
    ensure_default_settings,
    get_setting,
    set_setting,
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
        self.assertEqual(get_setting(self.user_id, "anki_mandarin_writting_deck"), "")
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


if __name__ == "__main__":
    unittest.main()
