import bootstrap  # noqa: F401
import unittest
from types import SimpleNamespace

from flask import Flask

from backend.extensions import db
from backend.hsk_level import (
    HSK_LEVEL_COMPLETION_RATIO,
    HSK_MAX_LEVEL,
    compute_current_hsk_level,
    get_chat_speaking_hsk_level,
    get_hsk_level_status,
    refresh_current_hsk_level,
    speaking_hsk_level_from_current,
)
from backend.models import Character, HskCharacter
from backend.settings import SETTING_LEVEL, get_setting

VOCABULARY = [
    SimpleNamespace(character="爱", level=1, frequency=30),
    SimpleNamespace(character="好", level=1, frequency=10),
    SimpleNamespace(character="八", level=1, frequency=20),
    SimpleNamespace(character="学", level=2, frequency=40),
    SimpleNamespace(character="习", level=2, frequency=50),
]


class TestHskLevel(unittest.TestCase):
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

    def test_status_orders_missing_characters_by_frequency(self):
        self.assertEqual(
            get_hsk_level_status({"爱"}, VOCABULARY),
            {
                "current_level": None,
                "next_level": 1,
                "characters_to_next_level": 2,
                "progress_to_next_level": (1 / 3) * 100,
                "missing_characters": ["好", "八"],
                "max_level": HSK_MAX_LEVEL,
                "completion_ratio": HSK_LEVEL_COMPLETION_RATIO,
            },
        )

    def test_status_completes_level_at_85_percent(self):
        level_one = [
            SimpleNamespace(
                character=chr(0x4E00 + index),
                level=1,
                frequency=index + 1,
            )
            for index in range(10)
        ]
        level_two = [
            SimpleNamespace(character="学", level=2, frequency=40),
            SimpleNamespace(character="习", level=2, frequency=50),
        ]
        known = {entry.character for entry in level_one[:9]}
        missing_level_one = level_one[9].character

        self.assertEqual(
            get_hsk_level_status(known, [*level_one, *level_two]),
            {
                "current_level": 1,
                "next_level": 2,
                "characters_to_next_level": 2,
                "progress_to_next_level": (9 / 11) * 100,
                "missing_characters": [missing_level_one, "学", "习"],
                "max_level": HSK_MAX_LEVEL,
                "completion_ratio": HSK_LEVEL_COMPLETION_RATIO,
            },
        )

    def test_status_returns_current_level_once_threshold_met(self):
        self.assertEqual(
            get_hsk_level_status({"爱", "好", "八", "学"}, VOCABULARY),
            {
                "current_level": 1,
                "next_level": 2,
                "characters_to_next_level": 1,
                "progress_to_next_level": (4 / 5) * 100,
                "missing_characters": ["习"],
                "max_level": HSK_MAX_LEVEL,
                "completion_ratio": HSK_LEVEL_COMPLETION_RATIO,
            },
        )

    def test_status_returns_max_when_all_levels_complete(self):
        vocabulary = [
            SimpleNamespace(character=char, level=level, frequency=level)
            for level, char in enumerate(
                ["一", "二", "三", "四", "五", "六", "七"],
                start=1,
            )
        ]
        known = {entry.character for entry in vocabulary}
        self.assertEqual(
            get_hsk_level_status(known, vocabulary),
            {
                "current_level": HSK_MAX_LEVEL,
                "next_level": None,
                "characters_to_next_level": None,
                "progress_to_next_level": 100.0,
                "missing_characters": [],
                "max_level": HSK_MAX_LEVEL,
                "completion_ratio": HSK_LEVEL_COMPLETION_RATIO,
            },
        )
        self.assertEqual(compute_current_hsk_level(known, vocabulary), HSK_MAX_LEVEL)

    def test_speaking_level_is_one_above_completed(self):
        self.assertEqual(speaking_hsk_level_from_current(None), 1)
        self.assertEqual(speaking_hsk_level_from_current(2), 3)
        self.assertEqual(speaking_hsk_level_from_current(7), 7)

    def test_refresh_persists_current_level(self):
        for char in ("爱", "好", "八"):
            db.session.add(HskCharacter(character=char, level=1, frequency=1))
            db.session.add(Character(char=char, pinyin="x", writting_known=True))
        db.session.add(HskCharacter(character="学", level=2, frequency=1))
        db.session.add(HskCharacter(character="习", level=2, frequency=2))
        db.session.commit()

        level = refresh_current_hsk_level()

        self.assertEqual(level, 1)
        self.assertEqual(get_setting(SETTING_LEVEL), "1")
        self.assertEqual(get_chat_speaking_hsk_level(), 2)


if __name__ == "__main__":
    unittest.main()
