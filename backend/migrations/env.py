"""Alembic environment — URL and metadata come from the Flask app models."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from backend.utils.database.alembic_runner import SQLALCHEMY_URL_ATTRIBUTE
from backend.utils.database.db_config import resolve_database_url
from backend.utils.database.extensions import db
import backend.utils.database.models  # noqa: F401 — register models on metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = db.Model.metadata


def get_url() -> str:
    """Prefer a programmatic override, then ini, else ``DATABASE_URL`` / ``DB_*``."""
    override = config.attributes.get(SQLALCHEMY_URL_ATTRIBUTE)
    if override:
        return override
    configured = config.get_main_option("sqlalchemy.url")
    if configured and not configured.startswith("driver://"):
        return configured
    return resolve_database_url()


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
