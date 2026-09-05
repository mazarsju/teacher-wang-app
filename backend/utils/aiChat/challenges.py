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
    "challenge-directions": {
        "title": "Passerby",
        "tasks": [
            {"id": "greet-passerby", "label": "Greet the passerby or ask for help"},
            {"id": "ask-location", "label": "Ask where a place is"},
            {"id": "ask-directions", "label": "Ask how to get there"},
            {"id": "thank-passerby", "label": "Thank the passerby"},
        ],
    },
    "challenge-train-station": {
        "title": "Ticket Seller",
        "tasks": [
            {"id": "greet-ticket-seller", "label": "Greet the ticket seller"},
            {
                "id": "buy-ticket",
                "label": "Ask for a ticket to your destination",
            },
            {
                "id": "ask-departure-time",
                "label": "Ask what time the train departs",
            },
            {"id": "pay-ticket", "label": "Pay for the ticket"},
        ],
    },
    "challenge-doctor": {
        "title": "Doctor",
        "tasks": [
            {"id": "greet-doctor", "label": "Greet the doctor"},
            {"id": "describe-symptoms", "label": "Describe how you feel"},
            {"id": "ask-for-medicine", "label": "Ask what medicine to take"},
            {
                "id": "ask-rest-days",
                "label": "Ask how many days you need to rest",
            },
        ],
    },
    "challenge-job-interview": {
        "title": "Job Interview",
        "tasks": [
            {"id": "greet-interviewer", "label": "Greet the interviewer"},
            {
                "id": "introduce-experience",
                "label": "Talk about your work experience",
            },
            {"id": "ask-salary", "label": "Ask about the salary"},
            {
                "id": "ask-result",
                "label": "Ask when you will hear back about the result",
            },
        ],
    },
    "challenge-library": {
        "title": "Librarian",
        "tasks": [
            {"id": "greet-librarian", "label": "Greet the librarian"},
            {"id": "borrow-book", "label": "Ask to borrow a book"},
            {
                "id": "ask-return-date",
                "label": "Ask when you need to return it",
            },
            {"id": "thank-librarian", "label": "Thank the librarian"},
        ],
    },
    "challenge-bus": {
        "title": "Bus Driver",
        "tasks": [
            {
                "id": "ask-bus-route",
                "label": "Ask if this bus goes to your destination",
            },
            {"id": "ask-stops", "label": "Ask how many stops it takes"},
            {"id": "ask-get-off-stop", "label": "Ask when to get off"},
            {
                "id": "thank-driver",
                "label": "Thank the driver when getting off",
            },
        ],
    },
    "challenge-hair-salon": {
        "title": "Hairdresser",
        "tasks": [
            {"id": "greet-hairdresser", "label": "Greet the hairdresser"},
            {"id": "ask-for-haircut", "label": "Say you want a haircut"},
            {
                "id": "describe-length",
                "label": "Say how short or long you want it",
            },
            {"id": "pay-haircut", "label": "Pay for the haircut"},
        ],
    },
    "challenge-apartment": {
        "title": "Landlord",
        "tasks": [
            {"id": "greet-landlord", "label": "Greet the landlord"},
            {"id": "ask-rent", "label": "Ask how much the rent is"},
            {"id": "ask-area", "label": "Ask how big the apartment is"},
            {
                "id": "confirm-rental",
                "label": "Say you want to rent the apartment",
            },
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
