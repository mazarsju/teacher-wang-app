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


def is_challenge_completed(character_id: str) -> bool:
    from backend.challenge_progress import load_completed_task_ids

    challenge = get_challenge(character_id)
    if challenge is None:
        return False

    tasks = challenge.get("tasks", [])
    if not isinstance(tasks, list) or len(tasks) == 0:
        return False

    completed = set(load_completed_task_ids(character_id))
    return all(
        isinstance(task, dict)
        and isinstance(task.get("id"), str)
        and task["id"] in completed
        for task in tasks
    )


def get_challenges_progress() -> dict:
    return {
        "challenges": [
            {
                "id": challenge_id,
                "completed": is_challenge_completed(challenge_id),
            }
            for challenge_id in CHALLENGES
        ]
    }
