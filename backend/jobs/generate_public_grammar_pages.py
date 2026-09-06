"""Export grammar content for the public (logged-out) static pages.

Writes one JSON array (content only — no per-user progress) that the frontend's
`generate-public-grammar-pages` script turns into static HTML under
`frontend/public/grammar/`. Re-run both whenever the public rule list or its
content changes.

Run from the repo root:

    python3 -m backend.jobs.generate_public_grammar_pages [--hsk-level 1]
"""

import argparse
import json
from pathlib import Path

from backend import create_app
from backend.routes.get_grammar_point import _resolve_new_words
from backend.utils.grammar.grammar_content_loader import (
    curriculum_index,
    fetch_grammar_content,
    list_grammar_manifests,
)

OUTPUT_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "scripts"
    / "data"
    / "public-grammar-content.json"
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hsk-level", type=int, default=1)
    parser.add_argument(
        "--id",
        action="append",
        dest="ids",
        help="Only export this grammar id (repeatable). Default: every rule at --hsk-level.",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        manifests = list_grammar_manifests(hsk_level=args.hsk_level)
        if args.ids:
            wanted = set(args.ids)
            manifests = {k: m for k, m in manifests.items() if m["id"] in wanted}

        entries = []
        for folder_key, manifest in sorted(
            manifests.items(), key=lambda item: curriculum_index(item[0])
        ):
            content = fetch_grammar_content(folder_key, "en")
            new_words = _resolve_new_words(manifest.get("new_words") or [], "en")
            entries.append(
                {
                    "id": manifest["id"],
                    "title": manifest["title"],
                    "hsk_level": manifest["hsk_level"],
                    "explanation": content["explanation"],
                    "exercises": content["exercises"],
                    "new_words": new_words,
                }
            )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    print(f"Wrote {len(entries)} grammar points to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
