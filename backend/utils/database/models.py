from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, Integer, Numeric, String, Table
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.hybrid import hybrid_property

from backend.utils.database.extensions import db

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
    custom_fields = db.Column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=db.text("'{}'::jsonb"),
    )
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


class WeeklyArticle(db.Model):
    """LLM-picked China-news articles adapted for a week/HSK level.

    ``content`` is a JSON list of ``{"title", "content", "category"?,
    "translation"?, "pinyin"?, "new_words"?}`` objects, one per article
    picked for that level (different levels may pick different source
    articles — see ``backend/utils/generateArticle/weekly_article_generator.py``).
    ``category`` is the source Currents API article's category list, when
    present. ``translation`` only appears for HSK 1-3, ``pinyin`` only for
    HSK 1-2, and ``new_words`` (a list of ``{"word", "translation"}``,
    vocabulary beyond that level) only for HSK 1-4, and only when non-empty.
    """

    __tablename__ = "weekly_articles"
    __table_args__ = (
        db.UniqueConstraint(
            "week", "year", "hsk_level", name="uq_weekly_articles_week_year_hsk_level"
        ),
    )

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    week = db.Column(Integer, nullable=False)
    year = db.Column(Integer, nullable=False)
    hsk_level = db.Column(Integer, nullable=False)
    content = db.Column(JSONB, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utcnow,
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


class GrammarPoint(db.Model):
    """A grammar point taught at a given HSK level."""

    __tablename__ = "grammar_points"

    # grammar.yaml's own `id` field, e.g. "hsk1_basic_sentence_structure".
    id = db.Column(String(128), primary_key=True)
    hsk_level = db.Column(Integer, nullable=False)
    title = db.Column(String, nullable=False)
    s3_key = db.Column(String, nullable=True)
    new_words = db.Column(JSONB, nullable=True)


class GrammarPrerequisite(db.Model):
    """A grammar point that should be learned before another."""

    __tablename__ = "grammar_prerequisites"

    grammar_id = db.Column(
        String(128), ForeignKey("grammar_points.id"), primary_key=True
    )
    prerequisite_id = db.Column(
        String(128), ForeignKey("grammar_points.id"), primary_key=True
    )


class UserGrammarProgress(db.Model):
    """A user's practice progress on a grammar point."""

    __tablename__ = "user_grammar_progress"

    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    grammar_id = db.Column(
        String(128), ForeignKey("grammar_points.id"), primary_key=True
    )
    status = db.Column(String, nullable=False, default="TODO")
    score = db.Column(Numeric, nullable=True)
    last_practiced_at = db.Column(db.DateTime(timezone=True), nullable=True)
    usage_in_real_life = db.Column(Numeric, nullable=True)


class ConversationSummary(db.Model):
    """Stored summary of an AI agent conversation.

    ``conversation_id`` is the same identifier used for the conversation's
    S3 transcript (a character/challenge id, or a correction thread id).
    """

    __tablename__ = "conversation_summary"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(Numeric, ForeignKey("users.shortid"), primary_key=True)
    conversation_id = db.Column(String, nullable=False)
    summary = db.Column(JSONB, nullable=False)
    revision = db.Column(Numeric)
    latest = db.Column(db.Boolean)


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
