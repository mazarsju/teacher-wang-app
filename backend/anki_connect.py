"""Thin HTTP client for the AnkiConnect add-on (localhost:8765)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

ANKI_CONNECT_URL = "http://127.0.0.1:8765"
ANKI_CONNECT_VERSION = 6
DEFAULT_TIMEOUT_SECONDS = 3.0


class AnkiConnectError(Exception):
    """Raised when AnkiConnect is unreachable or returns an error."""


def invoke(
    action: str,
    *,
    params: dict[str, Any] | None = None,
    url: str = ANKI_CONNECT_URL,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    payload = {
        "action": action,
        "version": ANKI_CONNECT_VERSION,
        "params": params or {},
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AnkiConnectError(
            "AnkiConnect is unreachable. Start Anki with the AnkiConnect add-on enabled."
        ) from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise AnkiConnectError("AnkiConnect returned an invalid response.") from exc

    if not isinstance(data, dict):
        raise AnkiConnectError("AnkiConnect returned an invalid response.")

    error = data.get("error")
    if error is not None:
        raise AnkiConnectError(str(error))

    return data.get("result")


def deck_names() -> list[str]:
    result = invoke("deckNames")
    if not isinstance(result, list) or not all(isinstance(name, str) for name in result):
        raise AnkiConnectError("AnkiConnect returned an invalid deck list.")
    return result


def create_deck(deck_name: str) -> Any:
    return invoke("createDeck", params={"deck": deck_name})


def model_names() -> list[str]:
    result = invoke("modelNames")
    if not isinstance(result, list) or not all(isinstance(name, str) for name in result):
        raise AnkiConnectError("AnkiConnect returned an invalid model list.")
    return result


def model_field_names(model_name: str) -> list[str]:
    result = invoke("modelFieldNames", params={"modelName": model_name})
    if not isinstance(result, list) or not all(isinstance(name, str) for name in result):
        raise AnkiConnectError("AnkiConnect returned an invalid field list.")
    return result


def is_connected() -> bool:
    try:
        deck_names()
        return True
    except AnkiConnectError:
        return False
