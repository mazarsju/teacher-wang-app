from flask import Blueprint, request

from backend.challenge_progress import (
    clear_completed_task_ids,
    load_completed_task_ids,
)
from backend.challenges import is_challenge_character
from backend.conversation_logs import (
    VALID_CHARACTER_IDS,
    clear_conversation,
    conversation_exists,
    create_conversation,
    load_conversation,
    replace_conversation,
)
from backend.user_context import current_user

bp = Blueprint("conversation_logs", __name__)


def _history_payload(user_id: str, character_id: str) -> dict:
    response: dict = {"messages": load_conversation(user_id, character_id)}
    if is_challenge_character(character_id):
        response["completed_task_ids"] = load_completed_task_ids(user_id, character_id)
    return response


@bp.get("/conversation-logs/<character_id>")
def get_conversation_log(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    try:
        return _history_payload(current_user().id, character_id), 200
    except PermissionError as error:
        return {"error": str(error)}, 403


@bp.post("/conversation-logs/<character_id>")
def create_conversation_log(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    user_id = current_user().id
    if conversation_exists(user_id, character_id):
        return {"error": "Conversation log already exists"}, 409

    create_conversation(user_id, character_id)
    return _history_payload(user_id, character_id), 201


@bp.patch("/conversation-logs/<character_id>")
def patch_conversation_log(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    messages = data.get("messages")
    if not isinstance(messages, list):
        return {"error": "messages must be an array"}, 400

    user_id = current_user().id
    try:
        replace_conversation(user_id, character_id, messages)
    except ValueError as error:
        return {"error": str(error)}, 400

    if not messages and is_challenge_character(character_id):
        clear_completed_task_ids(user_id, character_id)

    return _history_payload(user_id, character_id), 200


@bp.delete("/conversation-logs/<character_id>")
def delete_conversation_log(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    user_id = current_user().id
    clear_conversation(user_id, character_id)
    if is_challenge_character(character_id):
        clear_completed_task_ids(user_id, character_id)
    return {"message": "Conversation log deleted"}, 200
