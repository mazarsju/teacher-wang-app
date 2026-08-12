from flask import Blueprint, request

from backend.utils.knowledgeBase import anki_sync
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("anki", __name__)

VALID_KINDS = frozenset({"mandarin_vocabulary", "mandarin_writing"})
VALID_SYNC_ACTIONS = frozenset({"synchronize_all", "cancel_all", "partial"})


@bp.get("/anki/status")
def get_anki_status():
    return anki_sync.get_anki_status(current_user_id()), 200


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

    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writing"'}, 400

    if not isinstance(deck_name, str) or deck_name.strip() == "":
        return {"error": "deck_name must be a non-empty string"}, 400

    if not isinstance(model_name, str) or model_name.strip() == "":
        return {"error": "model_name must be a non-empty string"}, 400

    if not isinstance(fields, dict):
        return {"error": "fields must be an object"}, 400

    try:
        deck = anki_sync.setup_deck(
            current_user_id(),
            kind,
            deck_name,
            model_name=model_name,
            fields=fields,
        )
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return {"kind": kind, "deck": deck}, 200


@bp.get("/anki/sync/data/<kind>")
def get_sync_data(kind: str):
    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writing"'}, 400

    try:
        payload = anki_sync.get_sync_data(current_user_id(), kind)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return payload, 200


@bp.post("/anki/sync/mark-synchronized")
def mark_synchronized():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    kind = data.get("kind")
    action = data.get("action", "partial")
    ids = data.get("ids")
    succeeded_ids = data.get("succeeded_ids")
    ignore_ids = data.get("ignore_ids")
    failed = data.get("failed", 0)
    pull_count = data.get("pull_count")

    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writing"'}, 400

    if action not in VALID_SYNC_ACTIONS:
        return {
            "error": (
                'action must be "synchronize_all", "cancel_all", or "partial"'
            )
        }, 400

    if pull_count is not None and (
        not isinstance(pull_count, int) or isinstance(pull_count, bool)
    ):
        return {"error": "pull_count must be an integer"}, 400

    if not isinstance(failed, int) or isinstance(failed, bool) or failed < 0:
        return {"error": "failed must be a non-negative integer"}, 400

    # Full push completion: succeeded + ignored ids after Anki addNotes.
    if succeeded_ids is not None or ignore_ids is not None:
        if succeeded_ids is None:
            succeeded_ids = []
        if ignore_ids is None:
            ignore_ids = []
        if not isinstance(succeeded_ids, list) or not all(
            isinstance(item, str) for item in succeeded_ids
        ):
            return {"error": "succeeded_ids must be an array of strings"}, 400
        if not isinstance(ignore_ids, list) or not all(
            isinstance(item, str) for item in ignore_ids
        ):
            return {"error": "ignore_ids must be an array of strings"}, 400
        try:
            result = anki_sync.apply_push_completion(
                current_user_id(),
                kind,
                action,
                succeeded_card_ids=succeeded_ids,
                ignore_ids=ignore_ids,
                failed=failed,
                pull_count=pull_count,
            )
        except ValueError as exc:
            return {"error": str(exc)}, 400
        return result, 200

    if ids is None:
        return {"error": "ids is required"}, 400

    if not isinstance(ids, list) or not all(isinstance(item, str) for item in ids):
        return {"error": "ids must be an array of strings"}, 400

    try:
        result = anki_sync.mark_synchronized_result(
            current_user_id(),
            kind,
            ids,
            action=action,
            pull_count=pull_count,
        )
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return result, 200


@bp.post("/anki/sync/pull-apply")
def pull_apply():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    kind = data.get("kind")
    action = data.get("action")
    cards = data.get("cards", [])
    ignore_keys = data.get("ignore_keys", [])
    pull_count_after = data.get("pull_count_after")
    additional_char = data.get("additional_char", [])

    if kind not in VALID_KINDS:
        return {"error": 'kind must be "mandarin_vocabulary" or "mandarin_writing"'}, 400

    if action not in VALID_SYNC_ACTIONS:
        return {
            "error": (
                'action must be "synchronize_all", "cancel_all", or "partial"'
            )
        }, 400

    if not isinstance(cards, list) or not all(isinstance(item, dict) for item in cards):
        return {"error": "cards must be an array of objects"}, 400

    if not isinstance(ignore_keys, list) or not all(
        isinstance(item, str) for item in ignore_keys
    ):
        return {"error": "ignore_keys must be an array of strings"}, 400

    if not isinstance(additional_char, list) or not all(
        isinstance(item, str) for item in additional_char
    ):
        return {"error": "additional_char must be an array of strings"}, 400

    if pull_count_after is not None and (
        not isinstance(pull_count_after, int) or isinstance(pull_count_after, bool)
    ):
        return {"error": "pull_count_after must be an integer"}, 400

    try:
        result = anki_sync.apply_pull(
            current_user_id(),
            kind,
            action,
            cards=cards,
            ignore_keys=ignore_keys,
            pull_count_after=pull_count_after,
            additional_char=additional_char,
        )
    except ValueError as exc:
        return {"error": str(exc)}, 400

    return result, 200
