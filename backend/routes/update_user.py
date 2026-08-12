from flask import Blueprint, request

from backend.utils.database.extensions import db
from backend.utils.database.models import User
from backend.utils.database.settings import ADMIN_EMAIL, reset_available_token
from backend.utils.auth.user_context import current_user

bp = Blueprint("update_user", __name__)

VALID_PLANS = {"free", "pro"}


@bp.patch("/admin/users/<int:user_id>")
def update_user(user_id: int):
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if "plan" not in data:
        return {"error": "Missing required field: plan"}, 400

    plan = data["plan"]
    if plan not in VALID_PLANS:
        return {"error": "plan must be 'free' or 'pro'"}, 400

    target = User.query.filter_by(shortid=user_id).first()
    if target is None:
        return {"error": "User not found"}, 404

    if plan != target.plan:
        reset_available_token(target.shortid, plan, commit=False)
        target.plan = plan

    db.session.commit()

    return {"id": str(target.shortid), "email": target.email, "plan": target.plan}, 200
