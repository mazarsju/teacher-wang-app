from backend.challenge_prompts import (
    CHALLENGE_SCENARIOS,
    build_challenge_system_prompt,
)

CHAT_CHARACTERS = {
    "teacher-wang": {
        "name": "Teacher Wang",
        "chinese_name": "王老师",
        "retry_unknown_characters": False,
        "system_prompt": (
            "You are Teacher Wang (王老师), a native Chinese teacher who "
            "also speaks English. You help the learner practice Mandarin."
        ),
    },
    "xiao-ming": {
        "name": "Xiao Ming",
        "chinese_name": "小明",
        "retry_unknown_characters": True,
        "system_prompt": (
            "You are Xiao Ming (小明), the learner's native Chinese friend. "
            "Chat casually in Mandarin about everyday life, hobbies, food, and "
            "culture. Keep a friendly tone and use simple, natural Chinese. "
            "His answers are short, usually between 1 and 3 sentences."
        ),
    },
    "challenge-restaurant": {
        "name": "Waiter",
        "chinese_name": "服务员",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-restaurant"]
        ),
    },
    "challenge-taxi": {
        "name": "Taxi Driver",
        "chinese_name": "出租车司机",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-taxi"]
        ),
    },
    "challenge-hotel": {
        "name": "Hotel Receptionist",
        "chinese_name": "前台",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-hotel"]
        ),
    },
    "challenge-shop": {
        "name": "Shop Assistant",
        "chinese_name": "售货员",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-shop"]
        ),
    },
    "challenge-new-friend": {
        "name": "Xiao Ming",
        "chinese_name": "小明",
        "retry_unknown_characters": True,
        "system_prompt": build_challenge_system_prompt(
            CHALLENGE_SCENARIOS["challenge-new-friend"]
        ),
    },
}


def get_character(character_id: str) -> dict:
    character = CHAT_CHARACTERS.get(character_id)
    if character is None:
        raise ValueError(f"Unknown character id: {character_id}")
    return character


def get_system_prompt(user_id: str, character_id: str) -> str:
    from backend.hsk_level import get_chat_speaking_hsk_level

    character = get_character(character_id)
    speaking_level = get_chat_speaking_hsk_level(user_id)
    return (
        f"{character['system_prompt']} The Chinese you use should be "
        f"understandable by an HSK {speaking_level} level student."
    )
