"""Export the full curriculum (every HSK level's titles + writing practice) for the
public /curriculum overview page. No explanations/exercises/vocabulary here — see
generate_public_grammar_pages.py for a single rule's full content. No database
needed: titles/levels/ordering come straight from grammar.yaml/overview.yaml.

Run from the repo root:

    python3 -m backend.jobs.generate_public_curriculum
"""

import json
from pathlib import Path

from backend.utils.grammar.grammar_content_loader import (
    curriculum_index,
    list_grammar_manifests,
    list_writing_practice_manifests,
)

OUTPUT_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "scripts"
    / "data"
    / "public-curriculum.json"
)


def main() -> None:
    grammar_manifests = list_grammar_manifests()
    writing_manifests = list_writing_practice_manifests()

    grammar_points = sorted(
        (
            {
                "id": manifest["id"],
                "title": manifest["title"],
                "hsk_level": manifest["hsk_level"],
                "index": curriculum_index(folder_key),
            }
            for folder_key, manifest in grammar_manifests.items()
        ),
        key=lambda point: (point["hsk_level"], point["index"]),
    )
    writing_practices = [
        {
            "id": manifest["id"],
            "title": manifest["title"],
            "after_grammar_point": manifest["afterGrammarId"],
        }
        for manifest in writing_manifests.values()
    ]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {"grammar_points": grammar_points, "writing_practices": writing_practices},
            ensure_ascii=False,
            indent=2,
        )
    )
    print(
        f"Wrote {len(grammar_points)} grammar points and {len(writing_practices)} "
        f"writing topics to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
