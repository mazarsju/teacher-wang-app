from flask import Blueprint, request

from backend import anki_connect, anki_sync
from backend.anki_connect import AnkiConnectError

bp = Blueprint("anki", __name__)

VALID_KINDS = frozenset({"mandarin_vocabulary", "mandarin_writting"})
VALID_SYNC_ACTIONS = frozenset({"synchronize_all", "cancel_all", "partial"})
VALID_SYNC_DIRECTIONS = frozenset({"push", "pull"})


@bp.get("/anki/status")
def get_anki_status():
    return anki_sync.get_anki_status(), 200


@bp.get("/anki/decks")
def list_anki_decks():
    try:
        decks = anki_connect.deck_names()
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503

    return {"decks": decks}, 200


@bp.get("/anki/models")
def list_anki_models():
    try:
        models = anki_connect.model_names()
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503

    return {"models": models}, 200


@bp.get("/anki/models/<path:model_name>/fields")
def list_anki_model_fields(model_name: str):
    try:
        fields = anki_connect.model_field_names(model_name)
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503

    return {"fields": fields}, 200


@bp.post("/anki/decks/setup")
def setup_anki_deck():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    kind = data.get("kind")
    deck_name = data.get("deck_name")
    model_name = data.get("model_name")
    fields = data.get("fields")
    create = data.get("create", False)

    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writting"'}, 400

    if not isinstance(deck_name, str) or deck_name.strip() == "":
        return {"error": "deck_name must be a non-empty string"}, 400

    if not isinstance(model_name, str) or model_name.strip() == "":
        return {"error": "model_name must be a non-empty string"}, 400

    if not isinstance(fields, dict):
        return {"error": "fields must be an object"}, 400

    if not isinstance(create, bool):
        return {"error": "create must be a boolean"}, 400

    try:
        deck = anki_sync.setup_deck(
            kind,
            deck_name,
            model_name=model_name,
            fields=fields,
            create=create,
        )
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return {"kind": kind, "deck": deck}, 200


@bp.post("/anki/vocabulary/auto-setup")
def auto_setup_vocabulary():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    deck_name = data.get("deck_name")
    model_name = data.get("model_name")
    optional_fields = data.get("optional_fields", [])

    if not isinstance(deck_name, str) or deck_name.strip() == "":
        return {"error": "deck_name must be a non-empty string"}, 400

    if not isinstance(model_name, str) or model_name.strip() == "":
        return {"error": "model_name must be a non-empty string"}, 400

    if optional_fields is not None and not isinstance(optional_fields, list):
        return {"error": "optional_fields must be an array of strings"}, 400

    try:
        deck = anki_sync.create_vocabulary_three_direction_setup(
            deck_name=deck_name,
            model_name=model_name,
            optional_fields=optional_fields,
        )
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return {"kind": "mandarin_vocabulary", "deck": deck}, 200


@bp.get("/anki/sync/pending/<kind>")
def get_pending_sync(kind: str):
    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writting"'}, 400

    try:
        payload = anki_sync.get_pending_sync(kind)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return payload, 200


@bp.post("/anki/sync")
def sync_anki_deck():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    kind = data.get("kind")
    action = data.get("action")
    direction = data.get("direction", "push")
    selected_ids = data.get("selected_ids")

    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writting"'}, 400

    if action not in VALID_SYNC_ACTIONS:
        return {
            "error": (
                'action must be "synchronize_all", "cancel_all", or "partial"'
            )
        }, 400

    if direction not in VALID_SYNC_DIRECTIONS:
        return {"error": 'direction must be "push" or "pull"'}, 400

    if action == "partial" and selected_ids is None:
        return {"error": "selected_ids is required for partial synchronization"}, 400

    if selected_ids is not None and (
        not isinstance(selected_ids, list)
        or not all(isinstance(item, str) for item in selected_ids)
    ):
        return {"error": "selected_ids must be an array of strings"}, 400

    try:
        if direction == "pull":
            result = anki_sync.run_pull(
                kind,
                action,
                selected_ids=selected_ids,
            )
        else:
            result = anki_sync.run_sync(
                kind,
                action,
                selected_ids=selected_ids,
            )
    except AnkiConnectError as exc:
        return {"error": str(exc)}, 503
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return result, 200
