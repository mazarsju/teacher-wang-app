import bootstrap  # noqa: F401
import unittest

from flask import Flask

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


if __name__ == "__main__":
    unittest.main()
