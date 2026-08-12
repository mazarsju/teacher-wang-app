def create_app():
    from flask import Flask
    from flask_cors import CORS

    from backend.utils.database.database import configure_database, init_db
    from backend.routes import register_routes

    app = Flask(__name__)
    CORS(app)
    configure_database(app)
    init_db(app)
    register_routes(app)

    return app
