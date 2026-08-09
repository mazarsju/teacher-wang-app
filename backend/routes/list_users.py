from flask import Blueprint

from backend.models import User
from backend.settings import ADMIN_EMAIL
from backend.user_context import current_user

bp = Blueprint("list_users", __name__)


@bp.get("/admin/users")
def list_users():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    users = User.query.order_by(User.email).all()
    return {
        "users": [
            {
                "id": str(user.shortid),
                "email": user.email,
                "plan": user.plan,
                "last_connection": user.last_connection.isoformat(),
            }
            for user in users
        ]
    }, 200
