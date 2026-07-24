from flask import Blueprint, request

from backend.challenge_progress import (
    clear_completed_task_ids,
    load_completed_task_ids,
    save_completed_task_ids,
)
from backend.challenges import get_challenge, is_challenge_character
from backend.chat_service import (
    TEACHER_CHARACTER_ID,
    LlmTokenUsage,
    check_user_grammar,
    generate_challenge_reply,
    generate_chat_reply,
)
from backend.conversation_logs import (
    VALID_CHARACTER_IDS,
    append_message,
    append_thread_message,
    clear_conversation,
    create_correction_thread,
    load_conversation,
    should_append_thread_user_message,
    should_append_user_message,
    thread_exists,
)
from backend.token_usage import record_token_usage

bp = Blueprint("chat", __name__)


def _normalize_messages(messages: list) -> tuple[list[dict[str, str]] | None, tuple | None]:
    if not isinstance(messages, list) or len(messages) == 0:
        return None, ({"error": "messages must be a non-empty array"}, 400)

    normalized_messages = []
    for message in messages:
        if not isinstance(message, dict):
            return None, ({"error": "Each message must be an object"}, 400)

        role = message.get("role")
        content = message.get("content")

        if role not in {"user", "assistant"}:
            return None, ({"error": "Each message role must be user or assistant"}, 400)

        if not isinstance(content, str) or content.strip() == "":
            return None, (
                {"error": "Each message content must be a non-empty string"},
                400,
            )

        normalized_messages.append(
            {
                "role": role,
                "content": content.strip(),
            }
        )

    if normalized_messages[-1]["role"] != "user":
        return None, ({"error": "The last message must be from the user"}, 400)

    return normalized_messages, None


@bp.post("/chat")
def chat():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    character_id = data.get("character_id")
    messages = data.get("messages")
    parent_character_id = data.get("parent_character_id")
    thread_id = data.get("thread_id")

    if not isinstance(character_id, str) or character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    normalized_messages, error_response = _normalize_messages(messages)
    if error_response is not None:
        return error_response
    assert normalized_messages is not None

    is_thread_chat = parent_character_id is not None or thread_id is not None
    if is_thread_chat:
        if character_id != TEACHER_CHARACTER_ID:
            return {"error": "Correction threads must use Teacher Wang"}, 400

        if not isinstance(parent_character_id, str) or (
            parent_character_id not in VALID_CHARACTER_IDS
        ):
            return {"error": "Invalid parent_character_id"}, 400

        if parent_character_id == TEACHER_CHARACTER_ID:
            return {"error": "parent_character_id cannot be Teacher Wang"}, 400

        if not isinstance(thread_id, str) or not thread_exists(
            parent_character_id, thread_id
        ):
            return {"error": "Invalid thread_id"}, 400

        return _handle_thread_chat(
            parent_character_id,
            thread_id,
            character_id,
            normalized_messages,
        )

    return _handle_main_chat(character_id, normalized_messages)


def _handle_thread_chat(
    parent_character_id: str,
    thread_id: str,
    character_id: str,
    normalized_messages: list[dict[str, str]],
):
    last_user_message = normalized_messages[-1]
    token_usage = LlmTokenUsage()

    try:
        if should_append_thread_user_message(
            parent_character_id, thread_id, last_user_message
        ):
            append_thread_message(
                parent_character_id,
                thread_id,
                "user",
                last_user_message["content"],
            )

        reply = generate_chat_reply(character_id, normalized_messages)
        token_usage = token_usage + reply.token_usage
        append_thread_message(
            parent_character_id,
            thread_id,
            "assistant",
            reply.content,
        )
        record_token_usage(
            input_tokens=token_usage.input_tokens,
            output_tokens=token_usage.output_tokens,
        )
    except ValueError as error:
        return {"error": str(error)}, 400
    except Exception:
        return {"error": "Failed to generate a chat response"}, 500

    response = {
        "message": {
            "role": "assistant",
            "content": reply.content,
        },
        "tokens": token_usage.to_dict(),
    }
    if reply.unknown_characters:
        response["unknown_characters"] = reply.unknown_characters

    return response, 200


def _handle_main_chat(character_id: str, normalized_messages: list[dict[str, str]]):
    last_user_message = normalized_messages[-1]
    token_usage = LlmTokenUsage()
    completed_task_ids: list[str] | None = None
    judge_conversation: list[dict[str, str]] | None = None

    try:
        correction = None
        correction_payload = None
        correction_thread_id = None

        if character_id != TEACHER_CHARACTER_ID:
            correction = check_user_grammar(last_user_message["content"])
            token_usage = token_usage + correction.token_usage
            if (
                correction is not None
                and not correction.correct
                and correction.answer
            ):
                correction_thread_id, thread_messages = create_correction_thread(
                    character_id,
                    correction.answer,
                )
                correction_payload = {
                    **correction.to_dict(),
                    "thread_id": correction_thread_id,
                    "thread_messages": thread_messages,
                }

        if should_append_user_message(character_id, last_user_message):
            append_message(
                character_id,
                "user",
                last_user_message["content"],
                correction_thread_id=correction_thread_id,
            )

        if is_challenge_character(character_id):
            challenge = get_challenge(character_id)
            assert challenge is not None
            challenge_reply = generate_challenge_reply(
                character_id,
                normalized_messages,
                challenge["tasks"],
            )
            token_usage = token_usage + challenge_reply.token_usage
            reply_content = challenge_reply.content
            reply_unknown_characters = challenge_reply.unknown_characters
            previously_completed = load_completed_task_ids(character_id)
            completed_task_ids = list(
                dict.fromkeys(
                    [*previously_completed, *challenge_reply.completed_task_ids]
                )
            )
            save_completed_task_ids(character_id, completed_task_ids)
            if challenge_reply.judge_conversation:
                judge_conversation = challenge_reply.judge_conversation
        else:
            reply = generate_chat_reply(character_id, normalized_messages)
            token_usage = token_usage + reply.token_usage
            reply_content = reply.content
            reply_unknown_characters = reply.unknown_characters

        append_message(character_id, "assistant", reply_content)

        record_token_usage(
            input_tokens=token_usage.input_tokens,
            output_tokens=token_usage.output_tokens,
        )
    except ValueError as error:
        return {"error": str(error)}, 400
    except Exception:
        return {"error": "Failed to generate a chat response"}, 500

    response = {
        "message": {
            "role": "assistant",
            "content": reply_content,
        },
        "tokens": token_usage.to_dict(),
    }
    if reply_unknown_characters:
        response["unknown_characters"] = reply_unknown_characters
    if correction is not None:
        response["correction"] = correction_payload or correction.to_dict()
    if completed_task_ids is not None:
        response["completed_task_ids"] = completed_task_ids
    if judge_conversation:
        response["judge_conversation"] = judge_conversation

    return response, 200


@bp.get("/chat/history/<character_id>")
def chat_history(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    response = {"messages": load_conversation(character_id)}
    if is_challenge_character(character_id):
        response["completed_task_ids"] = load_completed_task_ids(character_id)
    return response, 200


@bp.delete("/chat/history/<character_id>")
def delete_chat_history(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        return {"error": "Invalid character_id"}, 400

    clear_conversation(character_id)
    if is_challenge_character(character_id):
        clear_completed_task_ids(character_id)
    return {"message": "Chat history cleared"}, 200
