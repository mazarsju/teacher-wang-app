import uuid

from backend.chat_agents import CHAT_CHARACTERS
from backend.conversation_log_storage import get_storage, object_key

# Re-export for callers/tests that still import the local root path.
from backend.conversation_log_storage import CONVERSATION_LOGS_DIR  # noqa: F401

VALID_CHARACTER_IDS = set(CHAT_CHARACTERS.keys())
USER_PREFIX = "me: "
AGENT_PREFIX = "agent: "
# Legacy single-line correction answer (pre-thread format).
CORRECTION_PREFIX = "correction: "
CORRECTION_THREAD_PREFIX = "correction-thread: "


def _unescape_content(content: str) -> str:
    return content.replace("\\n", "\n")


def _escape_content(content: str) -> str:
    return content.replace("\n", "\\n")


def _require_user_id(user_id: str) -> str:
    if not isinstance(user_id, str) or user_id.strip() == "":
        raise ValueError("Invalid user_id")
    return user_id


def _validate_character_id(character_id: str) -> None:
    if character_id not in VALID_CHARACTER_IDS:
        raise ValueError("Invalid character_id")


def _is_valid_thread_id(thread_id: str) -> bool:
    return bool(thread_id) and all(char.isalnum() or char == "-" for char in thread_id)


def log_object_key(user_id: str, character_id: str) -> str:
    _validate_character_id(character_id)
    return object_key(_require_user_id(user_id), f"{character_id}.txt")


def threads_prefix(user_id: str, character_id: str) -> str:
    _validate_character_id(character_id)
    return object_key(_require_user_id(user_id), f"{character_id}/threads/")


def thread_object_key(user_id: str, character_id: str, thread_id: str) -> str:
    _validate_character_id(character_id)
    if not _is_valid_thread_id(thread_id):
        raise ValueError("Invalid thread_id")
    return object_key(
        _require_user_id(user_id),
        f"{character_id}/threads/{thread_id}.txt",
    )


def _format_line(role: str, content: str) -> str:
    prefix = USER_PREFIX if role == "user" else AGENT_PREFIX
    return f"{prefix}{_escape_content(content)}"


def _parse_line(line: str) -> dict[str, str] | None:
    if line.startswith(USER_PREFIX):
        return {
            "role": "user",
            "content": _unescape_content(line[len(USER_PREFIX) :]),
        }

    if line.startswith(AGENT_PREFIX):
        return {
            "role": "assistant",
            "content": _unescape_content(line[len(AGENT_PREFIX) :]),
        }

    return None


def _load_messages_from_text(text: str | None) -> list[dict[str, str]]:
    if not text:
        return []

    messages: list[dict[str, str]] = []
    for line in text.splitlines():
        if line.strip() == "":
            continue

        parsed = _parse_line(line)
        if parsed is not None:
            messages.append(parsed)

    return messages


def conversation_exists(user_id: str, character_id: str) -> bool:
    return get_storage().exists(log_object_key(user_id, character_id))


def create_conversation(user_id: str, character_id: str) -> None:
    key = log_object_key(user_id, character_id)
    storage = get_storage()
    if storage.exists(key):
        raise FileExistsError("Conversation log already exists")
    storage.write_text(key, "")


def load_thread(user_id: str, character_id: str, thread_id: str) -> list[dict[str, str]]:
    text = get_storage().read_text(thread_object_key(user_id, character_id, thread_id))
    return _load_messages_from_text(text)


def thread_exists(user_id: str, character_id: str, thread_id: str) -> bool:
    try:
        return get_storage().exists(thread_object_key(user_id, character_id, thread_id))
    except ValueError:
        return False


def create_correction_thread(
    user_id: str,
    character_id: str,
    initial_assistant_message: str,
) -> tuple[str, list[dict[str, str]]]:
    """Create a Teacher Wang correction thread under a parent conversation."""
    content = initial_assistant_message.strip()
    if content == "":
        raise ValueError("Thread message content must be a non-empty string")

    thread_id = uuid.uuid4().hex
    thread_messages = [{"role": "assistant", "content": content}]
    _write_thread_messages(user_id, character_id, thread_id, thread_messages)
    return thread_id, thread_messages


def append_thread_message(
    user_id: str,
    character_id: str,
    thread_id: str,
    role: str,
    content: str,
) -> None:
    if role not in {"user", "assistant"}:
        raise ValueError("Invalid message role")

    stripped = content.strip()
    if stripped == "":
        raise ValueError("Message content must be a non-empty string")

    if not thread_exists(user_id, character_id, thread_id):
        raise ValueError("Unknown correction thread")

    key = thread_object_key(user_id, character_id, thread_id)
    storage = get_storage()
    existing = storage.read_text(key) or ""
    storage.write_text(key, existing + _format_line(role, stripped) + "\n")


def _write_thread_messages(
    user_id: str,
    character_id: str,
    thread_id: str,
    messages: list[dict[str, str]],
) -> None:
    key = thread_object_key(user_id, character_id, thread_id)
    lines = [_format_line(message["role"], message["content"]) for message in messages]
    get_storage().write_text(key, "\n".join(lines) + ("\n" if lines else ""))


def load_conversation(user_id: str, character_id: str) -> list[dict]:
    storage = get_storage()
    text = storage.read_text(log_object_key(user_id, character_id))
    if text is None:
        return []

    messages: list[dict] = []
    needs_rewrite = False

    for line in text.splitlines():
        if line.strip() == "":
            continue

        if line.startswith(CORRECTION_THREAD_PREFIX):
            if messages and messages[-1]["role"] == "user":
                thread_id = line[len(CORRECTION_THREAD_PREFIX) :].strip()
                _attach_thread(messages[-1], user_id, character_id, thread_id)
            continue

        if line.startswith(CORRECTION_PREFIX):
            if messages and messages[-1]["role"] == "user":
                answer = _unescape_content(line[len(CORRECTION_PREFIX) :])
                thread_id, thread_messages = create_correction_thread(
                    user_id,
                    character_id,
                    answer,
                )
                messages[-1]["correctionThreadId"] = thread_id
                messages[-1]["correctionThread"] = thread_messages
                messages[-1]["correctionAnswer"] = answer
                needs_rewrite = True
            continue

        parsed = _parse_line(line)
        if parsed is not None:
            messages.append(parsed)

    if needs_rewrite:
        _rewrite_conversation(user_id, character_id, messages)

    return messages


def _attach_thread(
    message: dict,
    user_id: str,
    character_id: str,
    thread_id: str,
) -> None:
    thread_messages = load_thread(user_id, character_id, thread_id)
    message["correctionThreadId"] = thread_id
    message["correctionThread"] = thread_messages
    if thread_messages and thread_messages[0]["role"] == "assistant":
        message["correctionAnswer"] = thread_messages[0]["content"]


def _rewrite_conversation(
    user_id: str,
    character_id: str,
    messages: list[dict],
) -> None:
    lines: list[str] = []

    for message in messages:
        role = message["role"]
        content = message["content"]
        lines.append(_format_line(role, content))
        thread_id = message.get("correctionThreadId")
        if role == "user" and isinstance(thread_id, str) and thread_id:
            lines.append(f"{CORRECTION_THREAD_PREFIX}{thread_id}")

    get_storage().write_text(
        log_object_key(user_id, character_id),
        "\n".join(lines) + ("\n" if lines else ""),
    )


def replace_conversation(
    user_id: str,
    character_id: str,
    messages: list[dict],
) -> None:
    """Full-replace the main transcript; keep referenced threads or clear all."""
    _validate_character_id(character_id)
    _require_user_id(user_id)

    if not messages:
        clear_conversation(user_id, character_id)
        return

    referenced_thread_ids: set[str] = set()
    normalized: list[dict] = []
    for message in messages:
        if not isinstance(message, dict):
            raise ValueError("Each message must be an object")
        role = message.get("role")
        content = message.get("content")
        if role not in {"user", "assistant"}:
            raise ValueError("Each message role must be user or assistant")
        if not isinstance(content, str):
            raise ValueError("Each message content must be a string")
        entry: dict = {"role": role, "content": content}
        thread_id = message.get("correctionThreadId")
        if role == "user" and isinstance(thread_id, str) and thread_id.strip():
            if not _is_valid_thread_id(thread_id):
                raise ValueError("Invalid thread_id")
            entry["correctionThreadId"] = thread_id
            referenced_thread_ids.add(thread_id)
        normalized.append(entry)

    storage = get_storage()
    prefix = threads_prefix(user_id, character_id)
    for key in storage.list_keys(prefix):
        name = key.rsplit("/", 1)[-1]
        if not name.endswith(".txt"):
            continue
        thread_id = name[: -len(".txt")]
        if thread_id not in referenced_thread_ids:
            storage.delete(key)

    _rewrite_conversation(user_id, character_id, normalized)


def append_message(
    user_id: str,
    character_id: str,
    role: str,
    content: str,
    *,
    correction_thread_id: str | None = None,
) -> None:
    if role not in {"user", "assistant"}:
        raise ValueError("Invalid message role")

    if correction_thread_id is not None and role != "user":
        raise ValueError("Only user messages can link a correction thread")

    if correction_thread_id is not None and not _is_valid_thread_id(
        correction_thread_id
    ):
        raise ValueError("Invalid thread_id")

    key = log_object_key(user_id, character_id)
    storage = get_storage()
    existing = storage.read_text(key) or ""
    addition = _format_line(role, content) + "\n"
    if correction_thread_id is not None:
        addition += f"{CORRECTION_THREAD_PREFIX}{correction_thread_id}\n"
    storage.write_text(key, existing + addition)


def clear_conversation(user_id: str, character_id: str) -> None:
    storage = get_storage()
    storage.delete(log_object_key(user_id, character_id))
    storage.delete_prefix(threads_prefix(user_id, character_id))


def should_append_user_message(
    user_id: str,
    character_id: str,
    user_message: dict[str, str],
) -> bool:
    existing_messages = load_conversation(user_id, character_id)
    if not existing_messages:
        return True

    last_message = existing_messages[-1]
    return not (
        last_message["role"] == "user"
        and last_message["content"] == user_message["content"]
    )


def should_append_thread_user_message(
    user_id: str,
    character_id: str,
    thread_id: str,
    user_message: dict[str, str],
) -> bool:
    existing_messages = load_thread(user_id, character_id, thread_id)
    if not existing_messages:
        return True

    last_message = existing_messages[-1]
    return not (
        last_message["role"] == "user"
        and last_message["content"] == user_message["content"]
    )
