from flask import Flask


def register_routes(app: Flask) -> None:
    from backend.routes import (
        anki,
        auth_me,
        bulk_characters,
        chat,
        challenges,
        conversation_logs,
        create_character,
        create_word,
        delete_character,
        delete_knowledge_base,
        delete_word,
        export_database,
        get_hsk_level,
        health,
        list_characters,
        list_hsk_character_words,
        list_hsk_characters,
        list_words,
        token_usage,
        update_character,
        update_word,
    )
    from backend.user_context import register_user_context

    register_user_context(app)

    app.register_blueprint(health.bp)
    app.register_blueprint(auth_me.bp)
    app.register_blueprint(chat.bp)
    app.register_blueprint(conversation_logs.bp)
    app.register_blueprint(challenges.bp)
    app.register_blueprint(token_usage.bp)
    app.register_blueprint(anki.bp)
    app.register_blueprint(list_characters.bp)
    app.register_blueprint(create_character.bp)
    app.register_blueprint(delete_character.bp)
    app.register_blueprint(update_character.bp)
    app.register_blueprint(list_words.bp)
    app.register_blueprint(create_word.bp)
    app.register_blueprint(update_word.bp)
    app.register_blueprint(delete_word.bp)
    app.register_blueprint(bulk_characters.bp)
    app.register_blueprint(export_database.bp)
    app.register_blueprint(delete_knowledge_base.bp)
    app.register_blueprint(list_hsk_characters.bp)
    app.register_blueprint(list_hsk_character_words.bp)
    app.register_blueprint(get_hsk_level.bp)
