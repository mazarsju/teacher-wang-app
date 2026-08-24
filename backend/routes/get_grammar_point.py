import random

from flask import Blueprint

from backend.routes.suggest_hsk_words import serialize_word
from backend.utils.auth.user_context import current_user_id
from backend.utils.database.models import (
    GrammarPoint,
    GrammarPrerequisite,
    HskWord,
    UserGrammarProgress,
)
from backend.utils.grammar.grammar_content_loader import fetch_grammar_content

bp = Blueprint("get_grammar_point", __name__)


def _pick_half(exercises):
    """Keep exercise order, but pick 1 of every 2 consecutive exercises at random."""
    if not exercises:
        return exercises
    return [random.choice(pair) for pair in zip(exercises[::2], exercises[1::2])]


def _resolve_new_words(words):
    """Looks up each word in hsk_words, keeping its lowest-level occurrence."""
    if not words:
        return []
    rows = (
        HskWord.query.filter(HskWord.word.in_(words))
        .order_by(HskWord.level.asc(), HskWord.frequency.asc())
        .all()
    )
    best_by_word = {}
    for row in rows:
        best_by_word.setdefault(row.word, row)
    return [serialize_word(best_by_word[word]) for word in words if word in best_by_word]


@bp.get("/grammar-points/<path:grammar_id>")
def get_grammar_point(grammar_id: str):
    point = GrammarPoint.query.get(grammar_id)
    if point is None:
        return {"error": "Grammar point not found"}, 404

    prerequisites = [
        row.prerequisite_id
        for row in GrammarPrerequisite.query.filter_by(grammar_id=grammar_id).all()
    ]
    progress = UserGrammarProgress.query.filter_by(
        user_id=current_user_id(), grammar_id=grammar_id
    ).first()

    content = (
        fetch_grammar_content(point.s3_key)
        if point.s3_key
        else {"explanation": None, "exercises": None}
    )

    return {
        "id": point.id,
        "hsk_level": point.hsk_level,
        "title": point.title,
        "prerequisites": prerequisites,
        "new_words": _resolve_new_words(point.new_words),
        "status": progress.status if progress else "TODO",
        "explanation": content["explanation"],
        "exercises": _pick_half(content["exercises"]),
    }, 200
