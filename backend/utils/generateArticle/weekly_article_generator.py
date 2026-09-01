from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.dialects.postgresql import insert

from backend.utils.aiChat.chat_service import _extract_json_object, _invoke_llm
from backend.utils.aiChat.teaching_strategy import get_teaching_strategy
from backend.utils.database.extensions import db
from backend.utils.database.models import HskWord, WeeklyArticle, utcnow
from backend.utils.request_logging import progress_log

ARTICLES_PER_LEVEL = 3
TRANSLATION_LEVELS = {1, 2, 3}
PINYIN_LEVELS = {1, 2}
# Below this, the retelling may loosen factual accuracy to stay readable.
LOOSE_ACCURACY_LEVELS = {1, 2}
# Below this, proper nouns / org names / technical terms are dropped unless
# necessary to follow the story.
AVOID_PROPER_NOUNS_LEVELS = {1, 2, 3}
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

# Per-level measure words (量词), from
# https://resources.allsetlearning.com/chinese/vocabulary/HSK_1-4_Measure_Words
# Beyond HSK4 there is no such constrained list — natural usage applies.
MEASURE_WORDS_BY_LEVEL: dict[int, list[str]] = {
    1: ["本 (běn)", "个 (gè)", "块 (kuài)", "岁 (suì)", "些 (xiē)", "一点儿 (yīdiǎnr)"],
    2: ["次 (cì)", "件 (jiàn)", "一下 (yīxià)"],
    3: [
        "把 (bǎ)", "层 (céng)", "段 (duàn)", "分 (fēn)", "公斤 (gōngjīn)",
        "角 (jiǎo)", "刻 (kè)", "口 (kǒu)", "辆 (liàng)", "双 (shuāng)",
        "条 (tiáo)", "碗 (wǎn)", "位 (wèi)", "元 (yuán)", "张 (zhāng)",
        "只 (zhī)", "种 (zhǒng)",
    ],
    4: [
        "倍 (bèi)", "遍 (biàn)", "场 (cháng)", "份 (fèn)", "公里 (gōnglǐ)",
        "节 (jié)", "棵 (kē)", "秒 (miǎo)", "篇 (piān)", "台 (tái)",
        "趟 (tàng)", "页 (yè)", "座 (zuò)",
    ],
}

ARTICLE_PICKER_SYSTEM_PROMPT_TEMPLATE = (
    "You are a news editor picking China-related news articles for a "
    "Mandarin learner at HSK {hsk_level}. Based only on the titles below, "
    "pick the {count} articles whose topic best matches this level's "
    "difficulty.\n\n"
    "Simple, concrete topics (a sports result, the weather, a new metro "
    "line, a new panda at the zoo, a local event) suit lower levels "
    "(HSK 1-2). Complex, abstract topics (geopolitics, economic strategy, "
    "tax policy, diplomacy) suit higher levels (HSK 5-6). Match the "
    "topic's complexity to HSK {hsk_level}.\n\n"
    'Reply with only a JSON object: {{"selected_ids": ["id1", ...]}} using '
    'each article\'s "id" field, ordered from best to least fitting.'
)

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

ARTICLE_ADAPTATION_SYSTEM_PROMPT_TEMPLATE = (
    "You are adapting China-related news articles into Mandarin Chinese "
    "reading material for a learner at this level.\n\n"
    "{strategy}\n\n"
    "Length: {length_guideline}\n\n"
    "The source text below contains {article_count} separate articles, "
    "separated by blank lines. Adapt each one independently, writing the "
    "title and content in Chinese characters only — never include pinyin, "
    "romanization, or parenthetical pronunciation next to any word in "
    'the "title" or "content" fields, even if the level instructions '
    "below say to provide pinyin. Pinyin, if requested, goes only in the "
    'separate "pinyin" field described below.\n'
    "{adaptation_instructions}\n\n"
    'Reply with only a JSON object: {{"articles": [...]}}, with exactly '
    "{article_count} entries in the same order as the source articles. "
    "Each entry is a JSON object with exactly these fields, no others:\n"
    "{field_instructions}\n"
    "Reply with only the JSON object, no commentary, no markdown."
)


def _measure_words_instruction(hsk_level: int) -> str:
    if hsk_level not in MEASURE_WORDS_BY_LEVEL:
        # No constrained list beyond HSK4 — natural usage applies.
        return ""
    cumulative = [
        word
        for level in range(1, hsk_level + 1)
        for word in MEASURE_WORDS_BY_LEVEL.get(level, [])
    ]
    return (
        "Measure words (量词): whenever a noun needs a measure word, use "
        f"only ones from this HSK 1-{hsk_level} list, matched to the "
        "correct noun — do not default to 个 for everything it doesn't fit, "
        f"and do not use a measure word outside this list: {'、'.join(cumulative)}."
    )


def _content_adaptation_instructions(hsk_level: int) -> str:
    lines = []
    if hsk_level in LOOSE_ACCURACY_LEVELS:
        lines.append(
            "You may simplify or adapt the information so it is easier to "
            "understand at this level. The retelling does not need to be "
            "fully factually accurate and may omit factual details, as "
            "long as it stays inspired by and recognizable from the "
            "original source."
        )
    if hsk_level in AVOID_PROPER_NOUNS_LEVELS:
        lines.append(
            "Do not preserve proper nouns, organization names, or "
            "technical terminology from the source unless they are "
            "necessary to understand the story — replace or omit them "
            "otherwise."
        )
    measure_words_instruction = _measure_words_instruction(hsk_level)
    if measure_words_instruction:
        lines.append(measure_words_instruction)
    return "\n".join(lines)


def _json_field_instructions(hsk_level: int) -> str:
    lines = [
        '- "title": a short Chinese title for the article.',
        '- "content": the adapted Chinese reading material for the article, '
        "in Chinese characters only, with no inline pinyin.",
    ]
    if hsk_level in TRANSLATION_LEVELS:
        lines.append('- "translation": an English translation of "content".')
    if hsk_level in PINYIN_LEVELS:
        lines.append('- "pinyin": the pinyin transcription of "content".')
    return "\n".join(lines)


def _normalize_article(article: dict, hsk_level: int, source: dict) -> dict:
    normalized = {
        "title": article.get("title", ""),
        "content": article.get("content", ""),
    }
    category = source.get("category")
    if category:
        normalized["category"] = category
    if hsk_level in TRANSLATION_LEVELS and "translation" in article:
        normalized["translation"] = article["translation"]
    if hsk_level in PINYIN_LEVELS and "pinyin" in article:
        normalized["pinyin"] = article["pinyin"]
    return normalized


def _normalize_new_words(raw_words) -> list[dict]:
    return [
        {"word": item.get("word", ""), "translation": item.get("translation", "")}
        for item in raw_words
        if isinstance(item, dict) and item.get("word")
    ]


def _known_hsk_words(words: set[str], hsk_level: int) -> set[str]:
    """Words already covered by HSK 1-``hsk_level`` vocabulary, per hsk_words."""
    if not words:
        return set()
    rows = HskWord.query.filter(
        HskWord.word.in_(words), HskWord.level <= hsk_level
    ).all()
    return {row.word for row in rows}


def _full_length_text(articles: list[dict]) -> str:
    sections = []
    for article in articles:
        title = article.get("title", "").strip()
        description = article.get("description", "").strip()
        sections.append(f"{title}\n{description}".strip())
    return "\n\n".join(sections)


def _pick_articles_for_level(
    articles: list[dict], hsk_level: int, count: int = ARTICLES_PER_LEVEL
) -> list[dict]:
    """Ask the LLM which articles (by title only) suit this HSK level."""
    if not articles:
        return []

    listing = "\n".join(
        f'{article.get("id")}: {article.get("title", "")}' for article in articles
    )
    system_prompt = ARTICLE_PICKER_SYSTEM_PROMPT_TEMPLATE.format(
        hsk_level=hsk_level, count=count
    )
    raw, _ = _invoke_llm(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Articles:\n{listing}"),
        ]
    )
    selected_ids = _extract_json_object(raw).get("selected_ids", [])

    by_id = {article.get("id"): article for article in articles}
    picked = [by_id[article_id] for article_id in selected_ids if article_id in by_id]
    return picked[:count]


def _adapt_articles_for_level(
    selected_articles: list[dict], hsk_level: int
) -> list[dict]:
    article_count = len(selected_articles)
    system_prompt = ARTICLE_ADAPTATION_SYSTEM_PROMPT_TEMPLATE.format(
        strategy=get_teaching_strategy(hsk_level).as_instructions(),
        length_guideline=ARTICLE_LENGTH_GUIDELINES[hsk_level],
        article_count=article_count,
        adaptation_instructions=_content_adaptation_instructions(hsk_level),
        field_instructions=_json_field_instructions(hsk_level),
    )
    raw, _ = _invoke_llm(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=_full_length_text(selected_articles)),
        ]
    )
    articles = _extract_json_object(raw).get("articles", [])
    return [
        _normalize_article(article, hsk_level, source)
        for article, source in zip(articles, selected_articles)
    ]


def _inject_new_words(content: list[dict], hsk_level: int) -> list[dict]:
    """Add a "new_words" field to each article's content that needs it.

    Reads the already-generated ``content`` back (a second LLM pass, after
    ``_adapt_articles_for_level``) and flags vocabulary beyond HSK
    1-``hsk_level``. Words the model flagged that are actually already in
    ``hsk_words`` at or below this level are dropped — the LLM's flagging
    is a best-effort guess, ``hsk_words`` is the source of truth. Articles
    with no remaining new words are left unchanged.
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

    per_article_words = [
        _normalize_new_words(
            results[index].get("new_words", []) if index < len(results) else []
        )
        for index in range(len(content))
    ]
    all_words = {item["word"] for words in per_article_words for item in words}
    known_words = _known_hsk_words(all_words, hsk_level)

    for article, new_words in zip(content, per_article_words):
        filtered_words = [item for item in new_words if item["word"] not in known_words]
        if filtered_words:
            article["new_words"] = filtered_words

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
    """Pick and adapt articles per HSK level, persisting one row per level.

    For each level, the LLM first picks ``ARTICLES_PER_LEVEL`` articles from
    ``articles`` (by title only) matching that level's topic difficulty,
    then adapts just those into reading material — so different levels can
    end up with different source articles. Each row's ``content`` is a JSON
    list of per-article objects (title, content, source category, optional
    translation/pinyin/new_words — see ``WeeklyArticle``).
    """
    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    progress_log(
        "weekly.start",
        week=iso_week,
        year=iso_year,
        source_count=len(articles),
    )

    for hsk_level in HSK_LEVELS:
        progress_log("weekly.level.start", level=hsk_level)
        progress_log("weekly.pick.start", level=hsk_level)
        selected = _pick_articles_for_level(articles, hsk_level)
        progress_log("weekly.pick.done", level=hsk_level, count=len(selected))

        progress_log("weekly.adapt.start", level=hsk_level)
        content = _adapt_articles_for_level(selected, hsk_level)
        progress_log("weekly.adapt.done", level=hsk_level, count=len(content))

        if hsk_level in NEW_WORDS_LEVELS:
            progress_log("weekly.new_words.start", level=hsk_level)
            content = _inject_new_words(content, hsk_level)
            progress_log("weekly.new_words.done", level=hsk_level)

        progress_log("weekly.save.start", level=hsk_level)
        _save_weekly_article(iso_week, iso_year, hsk_level, content)
        progress_log("weekly.level.done", level=hsk_level)

    db.session.commit()
    progress_log("weekly.commit.done", week=iso_week, year=iso_year)
    return {"week": iso_week, "year": iso_year, "hsk_levels": list(HSK_LEVELS)}
