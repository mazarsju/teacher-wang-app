from flask import Blueprint

from backend.cognito_admin import CognitoAdminError, delete_cognito_user
from backend.conversation_log_storage import get_storage, object_key
from backend.extensions import db
from backend.models import (
    ChallengeProgress,
    Character,
    IgnoreHskWord,
    IgnoreVocabCard,
    IgnoreWritingCard,
    Setting,
    TokenCount,
    User,
    Word,
)
from backend.settings import ADMIN_EMAIL
from backend.user_context import current_user

bp = Blueprint("delete_user", __name__)


@bp.delete("/admin/users/<int:user_id>")
def delete_user(user_id: int):
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    target = User.query.filter_by(shortid=user_id).first()
    if target is None:
        return {"error": "User not found"}, 404

    if target.email == ADMIN_EMAIL:
        return {"error": "Cannot delete the admin account"}, 400

    try:
        delete_cognito_user(target.id)
    except CognitoAdminError as exc:
        return {"error": exc.message}, 502

    for model in (
        Character,
        Word,
        Setting,
        IgnoreVocabCard,
        IgnoreWritingCard,
        IgnoreHskWord,
        ChallengeProgress,
        TokenCount,
    ):
        model.query.filter_by(user_id=target.shortid).delete()
    get_storage().delete_prefix(object_key(target.id, ""))
    db.session.delete(target)
    db.session.commit()

    return {"message": "User deleted"}, 200
