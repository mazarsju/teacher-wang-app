import bootstrap  # noqa: F401
import unittest

from flask import Flask
from sqlalchemy import inspect, text

from backend.database import _migrate_synchronized_columns
from backend.extensions import db
from backend.models import Character, Word


class TestSynchronizedColumn(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(self.app)
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_new_records_default_synchronized_to_false(self):
        db.create_all()
        db.session.add(Character(char="好", pinyin="hao3", writting_known=True))
        db.session.add(Word(word="你好", definition="hello"))
        db.session.commit()

        character = Character.query.filter_by(char="好").one()
        word = Word.query.filter_by(word="你好").one()
        self.assertFalse(character.synchronized)
        self.assertFalse(word.synchronized)

    def test_migrate_adds_synchronized_columns(self):
        db.session.execute(
            text(
                """
                CREATE TABLE character (
                    char TEXT PRIMARY KEY,
                    pinyin VARCHAR(6) NOT NULL,
                    writting_known BOOLEAN NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        db.session.execute(
            text(
                """
                CREATE TABLE words (
                    word VARCHAR(10) PRIMARY KEY,
                    definition VARCHAR(100),
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        db.session.execute(
            text(
                "INSERT INTO character (char, pinyin, writting_known, updated_at) "
                "VALUES ('好', 'hao3', 1, CURRENT_TIMESTAMP)"
            )
        )
        db.session.execute(
            text(
                "INSERT INTO words (word, definition, updated_at) "
                "VALUES ('你好', 'hello', CURRENT_TIMESTAMP)"
            )
        )
        db.session.commit()

        _migrate_synchronized_columns()

        inspector = inspect(db.engine)
        character_columns = {
            column["name"] for column in inspector.get_columns("character")
        }
        words_columns = {column["name"] for column in inspector.get_columns("words")}
        self.assertIn("synchronized", character_columns)
        self.assertIn("synchronized", words_columns)

        character_row = db.session.execute(
            text("SELECT synchronized FROM character WHERE char = '好'")
        ).one()
        word_row = db.session.execute(
            text("SELECT synchronized FROM words WHERE word = '你好'")
        ).one()
        self.assertEqual(character_row[0], 0)
        self.assertEqual(word_row[0], 0)


if __name__ == "__main__":
    unittest.main()
