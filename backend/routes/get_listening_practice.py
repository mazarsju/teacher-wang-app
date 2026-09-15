import json

from flask import Blueprint, Response

from backend.utils.auth.user_context import current_user, current_user_id
from backend.utils.database.models import ListeningPractice, ListeningProgress
from backend.utils.listening.listening_content_loader import (
    fetch_listening_breakdown,
    fetch_listening_exercises,
    fetch_listening_speaker_names,
    fetch_listening_text,
    list_listening_audio_segments,
    read_listening_audio,
    read_listening_audio_segment,
)

bp = Blueprint("get_listening_practice", __name__)


@bp.get("/listening-practices/<topic_id>")
def get_listening_practice(topic_id: str):
    topic = ListeningPractice.query.get(topic_id)
    if topic is None:
        return {"error": "Listening practice not found"}, 404

    progress_row = ListeningProgress.query.filter_by(
        user_id=current_user_id(), listening_topic=topic_id
    ).first()
    language = current_user().language

    exercises = fetch_listening_exercises(topic.hsk_level, topic.id, language)
    mcq_exercises = [
        exercise for exercise in exercises if exercise.get("type") != "open_question"
    ]
    bonus_question = next(
        (
            exercise["question"]
            for exercise in exercises
            if exercise.get("type") == "open_question"
        ),
        None,
    )

    speaker_names = fetch_listening_speaker_names(topic.hsk_level, topic.id)

    return {
        "id": topic.id,
        "title": topic.title,
        "hsk_level": topic.hsk_level,
        "type": topic.type,
        "man_name": speaker_names.get("manName"),
        "woman_name": speaker_names.get("womanName"),
        "status": progress_row.status if progress_row else "TODO",
        "vocabulary_score": progress_row.vocabulary_score if progress_row else 0,
        "grammar_score": progress_row.grammar_score if progress_row else 0,
        "text": fetch_listening_text(topic.hsk_level, topic.id) or "",
        "sentences": fetch_listening_breakdown(topic.hsk_level, topic.id, language),
        "exercises": mcq_exercises,
        "bonus_question": bonus_question,
        "progress": (
            json.loads(progress_row.progress)
            if progress_row and progress_row.progress
            else None
        ),
        "segment_ids": list_listening_audio_segments(topic.hsk_level, topic.id),
    }, 200


@bp.get("/listening-practices/<topic_id>/audio")
def get_listening_practice_audio(topic_id: str):
    topic = ListeningPractice.query.get(topic_id)
    if topic is None:
        return {"error": "Listening practice not found"}, 404

    audio = read_listening_audio(topic.hsk_level, topic.id)
    if audio is None:
        return {"error": "Audio not found"}, 404
    return Response(audio, mimetype="audio/mpeg")


@bp.get("/listening-practices/<topic_id>/audio/<int:segment>")
@bp.get("/listening-practices/<topic_id>/audio/<int:segment>/<int:chunk>")
def get_listening_practice_audio_segment(
    topic_id: str, segment: int, chunk: int | None = None
):
    topic = ListeningPractice.query.get(topic_id)
    if topic is None:
        return {"error": "Listening practice not found"}, 404

    audio = read_listening_audio_segment(
        topic.hsk_level, topic.id, segment, chunk=chunk
    )
    if audio is None:
        return {"error": "Audio not found"}, 404
    return Response(audio, mimetype="audio/mpeg")
