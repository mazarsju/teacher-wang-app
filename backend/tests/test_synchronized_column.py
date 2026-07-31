import bootstrap  # noqa: F401
import unittest

from backend.extensions import db
from backend.models import Character, Word
from postgres_test_case import PostgresTestCase


class TestSynchronizedColumn(PostgresTestCase):
    def test_new_records_default_synchronized_to_false(self):
        db.session.add(
            Character(
                user_id=self.user_id,
                char="好",
                pinyin="hao3",
                writting_known=True,
            )
        )
        db.session.add(Word(user_id=self.user_id, word="你好", definition="hello"))
        db.session.commit()

        character = Character.query.filter_by(user_id=self.user_id, char="好").one()
        word = Word.query.filter_by(user_id=self.user_id, word="你好").one()
        self.assertFalse(character.synchronized)
        self.assertFalse(word.synchronized)


if __name__ == "__main__":
    unittest.main()
