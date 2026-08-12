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
    "challenge-taxi": {
        "title": "Taxi Driver",
        "tasks": [
            {"id": "hail-taxi", "label": "Hail the taxi"},
            {"id": "give-destination", "label": "Tell the driver your destination"},
            {"id": "ask-fare", "label": "Ask how much the ride costs"},
            {"id": "pay-fare", "label": "Pay for the ride"},
        ],
    },
    "challenge-hotel": {
        "title": "Hotel Receptionist",
        "tasks": [
            {"id": "greet-receptionist", "label": "Greet the receptionist"},
            {"id": "check-in", "label": "Check in to your room"},
            {
                "id": "ask-breakfast",
                "label": "Ask what time breakfast starts",
            },
            {"id": "check-out", "label": "Check out of the hotel"},
        ],
    },
    "challenge-shop": {
        "title": "Shop Assistant",
        "tasks": [
            {"id": "greet-assistant", "label": "Greet the shop assistant"},
            {"id": "ask-price", "label": "Ask the price of a shirt"},
            {
                "id": "ask-different-size",
                "label": "Ask for a different size",
            },
            {"id": "pay-item", "label": "Pay for the item"},
        ],
    },
    "challenge-new-friend": {
        "title": "New Friend",
        "tasks": [
            {"id": "greet-friend", "label": "Say hi to your new friend"},
            {"id": "introduce-name", "label": "Introduce yourself by name"},
            {"id": "say-age", "label": "Tell them your age"},
        ],
    },
}

# Completing these challenges unlocks a persistent chat character and hands
# its conversation history over to that character (see routes/chat.py).
CHALLENGE_UNLOCKS_CHARACTER_ID = {
    "challenge-new-friend": "xiao-ming",
}


def get_challenge(character_id: str) -> dict | None:
    return CHALLENGES.get(character_id)


def get_unlocked_character_id(character_id: str) -> str | None:
    return CHALLENGE_UNLOCKS_CHARACTER_ID.get(character_id)


def is_challenge_character(character_id: str) -> bool:
    return character_id in CHALLENGES


def get_challenges_progress(user_id) -> dict:
    from backend.utils.aiChat.challenge_progress import has_completed_challenge

    return {
        "challenges": [
            {
                "id": challenge_id,
                "completed": has_completed_challenge(user_id, challenge_id),
            }
            for challenge_id in CHALLENGES
        ]
    }
