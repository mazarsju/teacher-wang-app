import bootstrap  # noqa: F401
import unittest
from datetime import datetime, timedelta, timezone

from flask import Flask

from backend.database import _migrate_settings_token_keys_to_token_count
from backend.extensions import db
from backend.models import Setting, TokenCount
from backend.settings import SETTING_LEVEL, ensure_default_settings, get_setting


class TestSettings(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(self.app)
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_ensure_default_settings_creates_level_and_anki_decks(self):
        ensure_default_settings()
        self.assertEqual(Setting.query.count(), 7)
        self.assertEqual(get_setting(SETTING_LEVEL), "")
        self.assertEqual(get_setting("anki_mandarin_vocabulary_deck"), "")
        self.assertEqual(get_setting("anki_mandarin_writting_deck"), "")

    def test_migrate_legacy_token_settings_into_token_count(self):
        now = datetime.now(timezone.utc)
        recent = (now - timedelta(hours=1)).isoformat()
        db.session.add(Setting(key="total_tk", value="30"))
        db.session.add(
            Setting(
                key="tk_events",
                value=f'[{{"ts":"{recent}","tokens":30}}]',
            )
        )
        db.session.add(Setting(key="tk_today", value="30"))
        db.session.add(Setting(key="tk_7_days", value="30"))
        db.session.commit()

        _migrate_settings_token_keys_to_token_count()

        self.assertEqual(TokenCount.query.count(), 1)
        row = TokenCount.query.first()
        self.assertEqual(row.tokens, 30)
        self.assertEqual(row.type, "input")
        self.assertEqual(row.price, 0)
        self.assertIsNone(db.session.get(Setting, "tk_events"))
        self.assertIsNone(db.session.get(Setting, "total_tk"))


if __name__ == "__main__":
    unittest.main()
