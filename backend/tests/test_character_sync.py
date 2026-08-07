import bootstrap  # noqa: F401
import unittest

from backend.character_sync import (
    build_character_pinyin_map_from_words,
    build_word_pinyin_for_storage,
    rebuild_characters_from_words,
    serialize_character,
)
from backend.extensions import db
from backend.models import Character, Word, utcnow
from backend.tests.postgres_test_case import PostgresTestCase


class TestBuildCharacterPinyinMapFromWords(unittest.TestCase):
    def test_collects_unique_readings_per_character(self):
        words = [
            Word(user_id=1, word="好吃", pinyin="hao3 chi1", updated_at=utcnow()),
            Word(user_id=1, word="爱好", pinyin="ai4 hao4", updated_at=utcnow()),
        ]

        readings = build_character_pinyin_map_from_words(words)

        self.assertEqual(readings["好"], ["hao3", "hao4"])
        self.assertEqual(readings["吃"], ["chi1"])
        self.assertEqual(readings["爱"], ["ai4"])

    def test_dedupes_repeated_characters_within_a_word(self):
        words = [Word(user_id=1, word="谢谢", pinyin="xie4 xie4", updated_at=utcnow())]

        readings = build_character_pinyin_map_from_words(words)

        self.assertEqual(readings["谢"], ["xie4"])


class TestRebuildCharactersFromWords(PostgresTestCase):
    def test_creates_characters_from_words(self):
        now = utcnow()
        db.session.add(
            Word(
                user_id=self.user_id,
                word="爱好",
                definition="hobby",
                pinyin="ai4 hao3",
                updated_at=now,
            )
        )
        db.session.commit()

        result = rebuild_characters_from_words(self.user_id)
        db.session.commit()

        self.assertEqual(len(result.updated_characters), 2)
        self.assertEqual(result.deleted_char_ids, [])
        love = Character.query.filter_by(user_id=self.user_id, char="爱").one()
        good = Character.query.filter_by(user_id=self.user_id, char="好").one()
        self.assertEqual(love.pinyin_readings, ["ai4"])
        self.assertEqual(good.pinyin_readings, ["hao3"])

    def test_serialize_character_includes_all_pinyin_readings(self):
        now = utcnow()
        db.session.add_all(
            [
                Word(user_id=self.user_id, word="的", pinyin="de", updated_at=now),
                Word(user_id=self.user_id, word="目的", pinyin="mu4 di4", updated_at=now),
            ]
        )
        db.session.commit()

        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        record = Character.query.filter_by(user_id=self.user_id, char="的").one()

        self.assertEqual(
            serialize_character(record),
            {
                "char": "的",
                "pinyin": "de",
                "pinyin_readings": ["de", "di4"],
                "writting_known": record.writting_known,
                "updated_at": record.updated_at.isoformat(),
            },
        )

    def test_adds_missing_pinyin_to_existing_character(self):
        now = utcnow()
        db.session.add(
            Character(
                user_id=self.user_id,
                char="好",
                pinyin="hao3",
                writting_known=True,
                synchronized=False,
            )
        )
        db.session.add(
            Word(
                user_id=self.user_id,
                word="爱好",
                pinyin="ai4 hao4",
                updated_at=now,
            )
        )
        db.session.commit()

        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        good = Character.query.filter_by(user_id=self.user_id, char="好").one()
        self.assertEqual(good.pinyin_readings, ["hao4"])
        self.assertTrue(good.writting_known)
        self.assertEqual(
            Character.query.filter_by(user_id=self.user_id, char="爱").one().pinyin_readings,
            ["ai4"],
        )

    def test_sets_writting_known_when_a_word_containing_char_is_known(self):
        now = utcnow()
        db.session.add(
            Word(
                user_id=self.user_id,
                word="你好",
                pinyin="ni3 hao3",
                writting_known=True,
                updated_at=now,
            )
        )
        db.session.add(
            Word(
                user_id=self.user_id,
                word="你们",
                pinyin="ni3 men2",
                writting_known=False,
                updated_at=now,
            )
        )
        db.session.commit()

        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        self.assertTrue(
            Character.query.filter_by(user_id=self.user_id, char="你").one().writting_known
        )
        self.assertTrue(
            Character.query.filter_by(user_id=self.user_id, char="好").one().writting_known
        )
        self.assertFalse(
            Character.query.filter_by(user_id=self.user_id, char="们").one().writting_known
        )

    def test_upgrades_existing_character_to_writting_known(self):
        now = utcnow()
        db.session.add(
            Character(
                user_id=self.user_id,
                char="好",
                pinyin="hao3",
                writting_known=False,
                synchronized=False,
            )
        )
        db.session.add(
            Word(
                user_id=self.user_id,
                word="好",
                pinyin="hao3",
                writting_known=True,
                updated_at=now,
            )
        )
        db.session.commit()

        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        self.assertTrue(
            Character.query.filter_by(user_id=self.user_id, char="好").one().writting_known
        )

    def test_removes_character_and_pinyin_when_no_longer_used(self):
        now = utcnow()
        db.session.add(
            Word(
                user_id=self.user_id,
                word="好吃",
                pinyin="hao3 chi1",
                updated_at=now,
            )
        )
        db.session.add(
            Word(
                user_id=self.user_id,
                word="爱好",
                pinyin="ai4 hao4",
                updated_at=now,
            )
        )
        db.session.commit()
        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        db.session.delete(
            Word.query.filter_by(user_id=self.user_id, word="好吃").one()
        )
        db.session.commit()
        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        self.assertIsNone(
            Character.query.filter_by(user_id=self.user_id, char="吃").first()
        )
        good = Character.query.filter_by(user_id=self.user_id, char="好").one()
        self.assertEqual(good.pinyin_readings, ["hao4"])
        self.assertEqual(
            Character.query.filter_by(user_id=self.user_id).count(),
            2,
        )

    def test_deletes_all_characters_when_last_word_is_removed(self):
        now = utcnow()
        db.session.add(
            Word(
                user_id=self.user_id,
                word="水",
                pinyin="shui3",
                updated_at=now,
            )
        )
        db.session.commit()
        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        db.session.delete(Word.query.filter_by(user_id=self.user_id, word="水").one())
        db.session.commit()
        rebuild_characters_from_words(self.user_id)
        db.session.commit()

        self.assertEqual(Character.query.filter_by(user_id=self.user_id).count(), 0)


class TestBuildWordPinyinForStorage(unittest.TestCase):
    def test_builds_index_aligned_pinyin(self):
        self.assertEqual(
            build_word_pinyin_for_storage("你好", "ni3 hao3"),
            "ni3 hao3",
        )

    def test_normalizes_anki_tokens_when_index_tokens_are_missing(self):
        self.assertEqual(
            build_word_pinyin_for_storage("水", "shuǐ"),
            "shui3",
        )

    def test_rejects_unresolved_pinyin(self):
        self.assertIsNone(build_word_pinyin_for_storage("你好", "ni3"))

    def test_allows_blank_pinyin(self):
        self.assertEqual(build_word_pinyin_for_storage("你好", ""), "")

    def test_lowercases_index_aligned_tokens(self):
        self.assertEqual(
            build_word_pinyin_for_storage("爱", "Ai3"),
            "ai3",
        )


if __name__ == "__main__":
    unittest.main()
