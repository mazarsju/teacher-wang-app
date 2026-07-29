#!/usr/bin/env python3
"""CLI: copy learner data from SQLite into PostgreSQL."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.db_config import resolve_database_url
from backend.sqlite_postgres_migrate import migrate_sqlite_file_to_url


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Replace learner data in PostgreSQL with rows from a SQLite file. "
            "HSK tables are not copied."
        ),
    )
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=_REPO_ROOT / "backend" / "teacher_wang.db",
        help="Path to source SQLite file (default: backend/teacher_wang.db)",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Target SQLAlchemy URL (default: DATABASE_URL / .env)",
    )
    args = parser.parse_args(argv)

    if args.database_url:
        database_url = args.database_url
    else:
        database_url = resolve_database_url()

    if database_url.startswith("sqlite:"):
        print(
            "Refusing to migrate into a SQLite URL. Set DATABASE_URL to Postgres.",
            file=sys.stderr,
        )
        return 2

    counts = migrate_sqlite_file_to_url(args.sqlite, database_url)
    print(f"Migrated from {args.sqlite} → {database_url}")
    for table, count in counts.items():
        print(f"  {table}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
