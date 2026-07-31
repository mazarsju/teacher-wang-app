import bootstrap  # noqa: F401
import unittest

from backend.models import Setting
from backend.settings import (
    SETTING_LEVEL,
    ensure_default_settings,
    get_setting,
    set_setting,
)
from postgres_test_case import PostgresTestCase, create_test_user


class TestSettings(PostgresTestCase):
    def test_ensure_default_settings_creates_level_and_anki_decks(self):
        ensure_default_settings(self.user_id)
        self.assertEqual(Setting.query.count(), 10)
        self.assertEqual(get_setting(self.user_id, SETTING_LEVEL), "")
        self.assertEqual(
            get_setting(self.user_id, "anki_synchronization_status"),
            "not_synchronized",
        )
        self.assertEqual(get_setting(self.user_id, "anki_mandarin_vocabulary_deck"), "")
        self.assertEqual(get_setting(self.user_id, "anki_mandarin_writting_deck"), "")

    def test_settings_are_isolated_per_user(self):
        other = create_test_user("other-user", "other", "other@example.com")
        set_setting(self.user_id, SETTING_LEVEL, "3", commit=True)
        set_setting(other.id, SETTING_LEVEL, "5", commit=True)

        self.assertEqual(get_setting(self.user_id, SETTING_LEVEL), "3")
        self.assertEqual(get_setting(other.id, SETTING_LEVEL), "5")
        self.assertEqual(get_setting("unknown-user", SETTING_LEVEL, "none"), "none")


if __name__ == "__main__":
    unittest.main()
