from flask import Blueprint, request

from backend.utils.auth.user_context import current_user
from backend.utils.database.models import ListeningPractice
from backend.utils.listening.listening_content_loader import (
    fetch_listening_practice_translations,
)

bp = Blueprint("list_listening_practices_light", __name__)


@bp.get("/listening-practices-light")
def list_listening_practices_light():
    language = current_user().language
    translations = fetch_listening_practice_translations(language)

    query = ListeningPractice.query
    max_hsk_level = request.args.get("max_hsk_level", type=int)
    if max_hsk_level is not None:
        query = query.filter(ListeningPractice.hsk_level <= max_hsk_level)

    topics = query.order_by(ListeningPractice.hsk_level, ListeningPractice.id).all()

    return {
        "listening_practices": [
            {
                "id": topic.id,
                "title": translations.get(topic.id, {}).get("title", topic.title),
                "hsk_level": topic.hsk_level,
                "type": translations.get(topic.id, {}).get("type", topic.type),
                "topic": topic.topic,
                "translated_topic": translations.get(topic.id, {}).get(
                    "topic", topic.topic
                ),
            }
            for topic in topics
        ],
    }, 200
