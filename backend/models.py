from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Table,
)

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
    username = db.Column(String, nullable=False, unique=True)
    email = db.Column(String, nullable=False, unique=True)
    plan = db.Column(String, nullable=False, default=DEFAULT_USER_PLAN)
    last_connexion = db.Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )


character_word = Table(
    "character_word",
    db.Model.metadata,
    Column("user_id", String, ForeignKey("users.id"), primary_key=True),
    Column("character_char", String, primary_key=True),
    Column("word", String(10), primary_key=True),
    ForeignKeyConstraint(
        ["user_id", "character_char"],
        ["character.user_id", "character.char"],
    ),
    ForeignKeyConstraint(["user_id", "word"], ["words.user_id", "words.word"]),
)


hsk_word_character = Table(
    "hsk_word_character",
    db.Model.metadata,
    Column("word", String(32), ForeignKey("hsk_words.word"), primary_key=True),
    Column(
        "character",
        String(1),
        ForeignKey("hsk_characters.character"),
        primary_key=True,
    ),
)


class Character(db.Model):
    __tablename__ = "character"

    user_id = db.Column(String, ForeignKey("users.id"), primary_key=True)
    char = db.Column(String, primary_key=True)
    pinyin = db.Column(String(8), nullable=False)
    writting_known = db.Column(Boolean, nullable=False, default=False)
    synchronized = db.Column(Boolean, nullable=False, default=False)
    updated_at = db.Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )

    words = db.relationship(
        "Word",
        secondary=character_word,
        primaryjoin=(
            "and_(Character.user_id == character_word.c.user_id, "
            "Character.char == character_word.c.character_char)"
        ),
        secondaryjoin=(
            "and_(Word.user_id == character_word.c.user_id, "
            "Word.word == character_word.c.word)"
        ),
        back_populates="characters",
    )


class Word(db.Model):
    __tablename__ = "words"

    user_id = db.Column(String, ForeignKey("users.id"), primary_key=True)
    word = db.Column(String(10), primary_key=True)
    definition = db.Column(String(100), nullable=True)
    synchronized = db.Column(Boolean, nullable=False, default=False)
    updated_at = db.Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )

    characters = db.relationship(
        "Character",
        secondary=character_word,
        primaryjoin=(
            "and_(Word.user_id == character_word.c.user_id, "
            "Word.word == character_word.c.word)"
        ),
        secondaryjoin=(
            "and_(Character.user_id == character_word.c.user_id, "
            "Character.char == character_word.c.character_char)"
        ),
        back_populates="words",
    )


class HskWord(db.Model):
    __tablename__ = "hsk_words"

    word = db.Column(String(32), primary_key=True)
    level = db.Column(Integer, nullable=False)
    frequency = db.Column(Integer, nullable=False)

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

    words = db.relationship(
        "HskWord",
        secondary=hsk_word_character,
        back_populates="characters",
    )


class Setting(db.Model):
    """Per-user settings stored as key/value pairs."""

    __tablename__ = "settings"

    user_id = db.Column(String, ForeignKey("users.id"), primary_key=True)
    key = db.Column(String(64), primary_key=True)
    value = db.Column(String, nullable=False, default="")


class IgnoreVocabCard(db.Model):
    """Anki vocabulary writting values ignored for pull sync."""

    __tablename__ = "ignore_vocab_card"

    user_id = db.Column(String, ForeignKey("users.id"), primary_key=True)
    writting = db.Column(String, primary_key=True)


class IgnoreWrittingCard(db.Model):
    """Anki writing recto values ignored for pull sync."""

    __tablename__ = "ignore_writting_card"

    user_id = db.Column(String, ForeignKey("users.id"), primary_key=True)
    recto = db.Column(String, primary_key=True)


class TokenCount(db.Model):
    """One recorded LLM token-usage event (input or output)."""

    __tablename__ = "token_count"

    user_id = db.Column(String, ForeignKey("users.id"), primary_key=True)
    recorded_at = db.Column(
        DateTime(timezone=True),
        primary_key=True,
        nullable=False,
        default=utcnow,
    )
    type = db.Column(String(16), primary_key=True, nullable=False)
    tokens = db.Column(Integer, nullable=False)
    # Cost in USD cents, with 5 decimal places of precision.
    price = db.Column(Numeric(20, 5), nullable=False, default=0)
