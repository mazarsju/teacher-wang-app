"""Challenge scenario definitions (tasks judged during challenge chats)."""

CHALLENGES = {
    "challenge-restaurant": {
        "title": "Waiter",
        "tasks": [
            {"id": "call-waiter", "label": "Call the waiter"},
            {
                "id": "ask-no-meat",
                "label": "Ask if they have a dish without meat",
            },
            {"id": "ask-bill", "label": "Ask for the bill"},
            {"id": "pay-bill", "label": "Pay the bill"},
        ],
    },
}


def get_challenge(character_id: str) -> dict | None:
    return CHALLENGES.get(character_id)


def is_challenge_character(character_id: str) -> bool:
    return character_id in CHALLENGES
