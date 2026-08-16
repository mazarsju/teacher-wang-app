from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.dialects.postgresql import insert

from backend.utils.aiChat.chat_service import _extract_json_object, _invoke_llm
from backend.utils.aiChat.teaching_strategy import get_teaching_strategy
from backend.utils.database.extensions import db
from backend.utils.database.models import WeeklyArticle, utcnow

# Levels adapted from the LLM-generated summary; the rest from the full
# (title + description) text — richer source material for the higher levels.
SUMMARIZED_SOURCE_LEVELS = {1, 2}
TRANSLATION_LEVELS = {1, 2, 3}
PINYIN_LEVELS = {1, 2}
# Beyond HSK4, the reading material is close to unrestricted vocabulary, so
# flagging "new words" stops being a meaningful signal.
NEW_WORDS_LEVELS = {1, 2, 3, 4}
HSK_LEVELS = range(1, 7)

ARTICLE_LENGTH_GUIDELINES: dict[int, str] = {
    1: "About 2 lines per article.",
    2: "About 3 to 8 lines per article.",
    3: "About 8 to 20 lines per article.",
    4: "About 20 to 35 lines per article.",
    5: "About 35 to 55 lines per article.",
    6: "About 55 to 90 lines per article, close to the full source length.",
}

NEW_WORDS_SYSTEM_PROMPT_TEMPLATE = (
    "You are a Mandarin teacher reviewing reading material written for an "
    "HSK {hsk_level} learner. The source text below contains "
    "{article_count} articles, separated by blank lines — each is the "
    '"content" of one reading passage, in order.\n\n'
    "For each article, list every Chinese word it uses that is NOT part of "
    "HSK 1-{hsk_level} vocabulary — words the learner is not yet expected "
    "to know.\n\n"
    'Reply with only a JSON object: {{"articles": [...]}}, with exactly '
    "{article_count} entries in the same order as the articles below. Each "
    "entry is a JSON object with exactly one field:\n"
    '- "new_words": a list of objects, each with "word" (the Chinese word) '
    'and "translation" (its English translation). Use an empty list if '
    "there are none.\n"
    "Reply with only the JSON object, no commentary, no markdown."
)

ARTICLE_SUMMARY_SYSTEM_PROMPT = (
    "You are a news editor. Summarize the following China-related news "
    "articles into a short combined summary, a few sentences per article, "
    "preserving the key facts. Reply with only the summarized text, no "
    "commentary, no markdown, no headings."
)

ARTICLE_ADAPTATION_SYSTEM_PROMPT_TEMPLATE = (
    "You are adapting China-related news articles into Mandarin Chinese "
    "reading material for a learner at this level.\n\n"
    "{strategy}\n\n"
    "Length: {length_guideline}\n\n"
    "The source text below contains {article_count} separate articles, "
    "separated by blank lines. Adapt each one independently, writing the "
    "title and content in Chinese (with pinyin/translation only as "
    "instructed below).\n\n"
    'Reply with only a JSON object: {{"articles": [...]}}, with exactly '
    "{article_count} entries in the same order as the source articles. "
    "Each entry is a JSON object with exactly these fields, no others:\n"
    "{field_instructions}\n"
    "Reply with only the JSON object, no commentary, no markdown."
)


def _json_field_instructions(hsk_level: int) -> str:
    lines = [
        '- "title": a short Chinese title for the article.',
        '- "content": the adapted Chinese reading material for the article.',
    ]
    if hsk_level in TRANSLATION_LEVELS:
        lines.append('- "translation": an English translation of "content".')
    if hsk_level in PINYIN_LEVELS:
        lines.append('- "pinyin": the pinyin transcription of "content".')
    return "\n".join(lines)


def _normalize_article(article: dict, hsk_level: int) -> dict:
    normalized = {
        "title": article.get("title", ""),
        "content": article.get("content", ""),
    }
    if hsk_level in TRANSLATION_LEVELS and "translation" in article:
        normalized["translation"] = article["translation"]
    if hsk_level in PINYIN_LEVELS and "pinyin" in article:
        normalized["pinyin"] = article["pinyin"]
    return normalized


def _full_length_text(articles: list[dict]) -> str:
    sections = []
    for article in articles:
        title = article.get("title", "").strip()
        description = article.get("description", "").strip()
        sections.append(f"{title}\n{description}".strip())
    return "\n\n".join(sections)


def _summarize_articles(full_text: str) -> str:
    text, _ = _invoke_llm(
        [
            SystemMessage(content=ARTICLE_SUMMARY_SYSTEM_PROMPT),
            HumanMessage(content=full_text),
        ]
    )
    return text


def _adapt_articles_for_level(
    source_text: str, hsk_level: int, article_count: int
) -> list[dict]:
    system_prompt = ARTICLE_ADAPTATION_SYSTEM_PROMPT_TEMPLATE.format(
        strategy=get_teaching_strategy(hsk_level).as_instructions(),
        length_guideline=ARTICLE_LENGTH_GUIDELINES[hsk_level],
        article_count=article_count,
        field_instructions=_json_field_instructions(hsk_level),
    )
    raw, _ = _invoke_llm(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=source_text),
        ]
    )
    articles = _extract_json_object(raw).get("articles", [])
    return [_normalize_article(article, hsk_level) for article in articles]


def _normalize_new_words(raw_words) -> list[dict]:
    return [
        {"word": item.get("word", ""), "translation": item.get("translation", "")}
        for item in raw_words
        if isinstance(item, dict) and item.get("word")
    ]


def _inject_new_words(content: list[dict], hsk_level: int) -> list[dict]:
    """Add a "new_words" field to each article's content that needs it.

    Reads the already-generated ``content`` back (a second LLM pass, after
    ``_adapt_articles_for_level``) and flags vocabulary beyond HSK
    1-``hsk_level``. Articles with no such words are left unchanged.
    """
    if not content:
        return content

    system_prompt = NEW_WORDS_SYSTEM_PROMPT_TEMPLATE.format(
        hsk_level=hsk_level, article_count=len(content)
    )
    source_text = "\n\n".join(article.get("content", "") for article in content)
    raw, _ = _invoke_llm(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=source_text),
        ]
    )
    results = _extract_json_object(raw).get("articles", [])

    for index, article in enumerate(content):
        raw_words = results[index].get("new_words", []) if index < len(results) else []
        new_words = _normalize_new_words(raw_words)
        if new_words:
            article["new_words"] = new_words

    return content


def _save_weekly_article(
    week: int, year: int, hsk_level: int, content: list[dict]
) -> None:
    db.session.execute(
        insert(WeeklyArticle)
        .values(
            week=week,
            year=year,
            hsk_level=hsk_level,
            content=content,
            created_at=utcnow(),
        )
        .on_conflict_do_update(
            index_elements=["week", "year", "hsk_level"],
            set_={"content": content, "created_at": utcnow()},
        )
    )


def generate_weekly_articles(articles: list[dict]) -> dict:
    """Adapt ``articles`` to each HSK level and persist one row per level.

    Each row's ``content`` is a JSON list of per-article objects (title,
    content, optional translation/pinyin/new_words — see
    ``WeeklyArticle``). Levels 1-2 are adapted from an LLM-generated
    summary of the articles; levels 3-6 are adapted from the full (title +
    description) text. As a second pass, levels 1-4 get their generated
    content read back to flag "new_words" beyond that level's vocabulary.
    """
    full_text = _full_length_text(articles)
    summarized_text = _summarize_articles(full_text)
    article_count = len(articles)

    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()

    for hsk_level in HSK_LEVELS:
        source_text = (
            summarized_text if hsk_level in SUMMARIZED_SOURCE_LEVELS else full_text
        )
        content = _adapt_articles_for_level(source_text, hsk_level, article_count)
        if hsk_level in NEW_WORDS_LEVELS:
            content = _inject_new_words(content, hsk_level)
        _save_weekly_article(iso_week, iso_year, hsk_level, content)

    db.session.commit()
    return {"week": iso_week, "year": iso_year, "hsk_levels": list(HSK_LEVELS)}
