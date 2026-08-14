from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.dialects.postgresql import insert

from backend.utils.aiChat.chat_service import _invoke_llm
from backend.utils.aiChat.teaching_strategy import get_teaching_strategy
from backend.utils.database.extensions import db
from backend.utils.database.models import WeeklyArticle, utcnow

# Levels adapted from the LLM-generated summary; the rest from the full
# (title + description) text — richer source material for the higher levels.
SUMMARIZED_SOURCE_LEVELS = {1, 2}
HSK_LEVELS = range(1, 7)

ARTICLE_LENGTH_GUIDELINES: dict[int, str] = {
    1: "About 2 lines per article.",
    2: "About 3 to 8 lines per article.",
    3: "About 8 to 20 lines per article.",
    4: "About 20 to 35 lines per article.",
    5: "About 35 to 55 lines per article.",
    6: "About 55 to 90 lines per article, close to the full source length.",
}

ARTICLE_SUMMARY_SYSTEM_PROMPT = (
    "You are a news editor. Summarize the following China-related news "
    "articles into a short combined summary, a few sentences per article, "
    "preserving the key facts. Reply with only the summarized text, no "
    "commentary, no markdown, no headings."
)

ARTICLE_ADAPTATION_SYSTEM_PROMPT_TEMPLATE = (
    "You are adapting China-related news articles into "
    "Mandarin Chinese reading material for a learner at this level.\n\n"
    "{strategy}\n\n"
    "Length: {length_guideline}\n\n"
    "Write the reading material in Chinese (with pinyin/translations only "
    "if the level guidance above asks for it). Keep the articles as "
    "separate short sections. Reply with only the reading material, no "
    "commentary, no markdown."
)


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


def _adapt_articles_for_level(source_text: str, hsk_level: int) -> str:
    system_prompt = ARTICLE_ADAPTATION_SYSTEM_PROMPT_TEMPLATE.format(
        strategy=get_teaching_strategy(hsk_level).as_instructions(),
        length_guideline=ARTICLE_LENGTH_GUIDELINES[hsk_level],
    )
    text, _ = _invoke_llm(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=source_text),
        ]
    )
    return text


def _save_weekly_article(week: int, year: int, hsk_level: int, content: str) -> None:
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

    Levels 1-2 are adapted from an LLM-generated summary of the articles;
    levels 3-6 are adapted from the full (title + description) text.
    """
    full_text = _full_length_text(articles)
    summarized_text = _summarize_articles(full_text)

    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()

    for hsk_level in HSK_LEVELS:
        source_text = (
            summarized_text if hsk_level in SUMMARIZED_SOURCE_LEVELS else full_text
        )
        content = _adapt_articles_for_level(source_text, hsk_level)
        _save_weekly_article(iso_week, iso_year, hsk_level, content)

    db.session.commit()
    return {"week": iso_week, "year": iso_year, "hsk_levels": list(HSK_LEVELS)}
