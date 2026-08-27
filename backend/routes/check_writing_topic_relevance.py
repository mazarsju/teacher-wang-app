from flask import Blueprint, request

from backend.utils.aiChat.chat_service import check_writing_topic_relevance

bp = Blueprint("check_writing_topic_relevance", __name__)


@bp.post("/writing/check-topic-relevance")
def check_writing_topic_relevance_route():
    body = request.get_json(silent=True) or {}
    text = body.get("text")
    topic = body.get("topic")
    if not isinstance(text, str) or text.strip() == "":
        return {"error": "text must be a non-empty string"}, 400
    if not isinstance(topic, str) or topic.strip() == "":
        return {"error": "topic must be a non-empty string"}, 400

    try:
        result = check_writing_topic_relevance(text, topic)
    except ValueError as error:
        return {"error": str(error)}, 400
    except Exception:
        return {"error": "Failed to check whether the text answers the topic"}, 500

    return {"on_topic": result.on_topic}, 200
