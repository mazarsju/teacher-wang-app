from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, Integer, Numeric, String, Table
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.hybrid import hybrid_property

from backend.extensions import db

DEFAULT_USER_PLAN = "free"

# Private (per-user) tables are hash-partitioned on user_id in Postgres.
# Partitions live in the Alembic revisions, not in these model definitions.
USER_PARTITION_MODULUS = 8


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(db.Model):
    """One learner account, keyed by the Cognito ``sub`` claim."""

    __tablename__ = "users"

    id = db.Column(String, primary_key=True)
    shortid = db.Column(
        Numeric,
        nullable=False,
        unique=True,
        server_default=db.text("nextval('users_shortid_seq')"),
    )
    username = db.Column(String, nullable=False, unique=True)
    email = db.Column(String, nullable=False, unique=True)
    plan = db.Column(String, nullable=False, default=DEFAULT_USER_PLAN)
    last_connection = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )


hsk_word_character = Table(
    "hsk_word_character",
    db.Model.metadata,
    Column("word_id", String(128), ForeignKey("hsk_words.id"), primary_key=True),
    Column(
        "character",
        String(1),
        ForeignKey("hsk_characters.character"),
        primary_key=True,
    ),
)


class Character(db.Model):
    __tablename__ = "character"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    char = db.Column(String, primary_key=True)
    # The `pinyin` column is a Postgres array (one reading per element), but
    # every character still has exactly one reading today. This property
    # keeps `.pinyin` a plain string for every caller, so only this model
    # needs to know the column is stored as an array.
    pinyin_readings = db.Column("pinyin", ARRAY(String(8)), nullable=False)
    writing_known = db.Column(db.Boolean, nullable=False, default=False)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )

    @hybrid_property
    def pinyin(self) -> str:
        return self.pinyin_readings[0] if self.pinyin_readings else ""

    @pinyin.setter
    def pinyin(self, value: str) -> None:
        self.pinyin_readings = [value] if value else []

    @pinyin.expression
    def pinyin(cls):  # noqa: N805 - SQLAlchemy hybrid expression convention
        return cls.pinyin_readings[1]  # Postgres arrays are 1-indexed


class Word(db.Model):
    __tablename__ = "words"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    word = db.Column(String(10), primary_key=True)
    definition = db.Column(String(100), nullable=True)
    pinyin = db.Column(String(64), nullable=True)
    writing_known = db.Column(db.Boolean, nullable=False, default=False)
    anki_voc_sync = db.Column(db.Boolean, nullable=False, default=False)
    anki_writing_sync = db.Column(db.Boolean, nullable=False, default=False)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )


class HskWord(db.Model):
    __tablename__ = "hsk_words"

    # Composite of word + "|" + pinyin (one row per reading/form).
    id = db.Column(String(128), primary_key=True)
    word = db.Column(String(32), nullable=False, index=True)
    level = db.Column(Integer, nullable=False)
    frequency = db.Column(Integer, nullable=False)
    pinyin = db.Column(String(64), nullable=False, default="")
    definition = db.Column(String(512), nullable=False, default="")

    characters = db.relationship(
        "HskCharacter",
        secondary=hsk_word_character,
        back_populates="words",
    )


class HskCharacter(db.Model):
    __tablename__ = "hsk_characters"

    character = db.Column(String(1), primary_key=True)
    level = db.Column(Integer, nullable=False)
    frequency = db.Column(Integer, nullable=False)
    most_used_pinyin = db.Column(String(8), nullable=False, default="")

    words = db.relationship(
        "HskWord",
        secondary=hsk_word_character,
        back_populates="characters",
    )


class Setting(db.Model):
    """Per-user settings stored as key/value pairs."""

    __tablename__ = "settings"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    key = db.Column(String(64), primary_key=True)
    value = db.Column(String, nullable=False, default="")


class IgnoreVocabCard(db.Model):
    """Anki vocabulary writing values ignored for pull sync."""

    __tablename__ = "ignore_vocab_card"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    writing = db.Column(String, primary_key=True)


class IgnoreWritingCard(db.Model):
    """Anki writing recto values ignored for pull sync."""

    __tablename__ = "ignore_writing_card"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    recto = db.Column(String, primary_key=True)


class IgnoreHskWord(db.Model):
    """HSK words ignored from the "words to learn next" suggestions."""

    __tablename__ = "ignore_hsk_words"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    writing = db.Column(String, primary_key=True)


class ChallengeProgress(db.Model):
    """Whether a user has fully completed a challenge scenario."""

    __tablename__ = "challenge_progress"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    challenge_scenario = db.Column(String, primary_key=True)
    completed = db.Column(db.Boolean, nullable=False, default=True)


class TokenCount(db.Model):
    """One recorded LLM token-usage event (input or output)."""

    __tablename__ = "token_count"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    recorded_at = db.Column(
        db.DateTime(timezone=True),
        primary_key=True,
        nullable=False,
        default=utcnow,
    )
    type = db.Column(String(16), primary_key=True, nullable=False)
    tokens = db.Column(Integer, nullable=False)
    # Cost in USD cents, with 5 decimal places of precision.
    price = db.Column(Numeric(20, 5), nullable=False, default=0)
