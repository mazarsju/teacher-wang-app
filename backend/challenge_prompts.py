"""Build DRY system prompts for Mandarin role-play challenge agents."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChallengeGate:
    """First-contact gate before the agent starts helping."""

    wait_bracket: str
    """Exact [[...]] reply before the learner makes first contact."""

    trigger_examples: str
    """Examples of what counts as first contact (Chinese phrases, etc.)."""

    trigger_description: str
    """Short verb phrase: e.g. 'called you', 'hailed you', 'greeted you'."""

    post_contact_action: str
    """What the agent must do after contact: e.g. 'come to the table'."""

    greeting_example: str
    """Chinese greeting / offer-to-help example after contact."""

    first_step_never_out_of_order: str
    """Sentence that the first contact action is never out of order at the start."""


@dataclass(frozen=True)
class ChallengeScenario:
    english_name: str
    chinese_name: str
    role_summary: str
    """Setting + what the agent helps the learner practice (after 'You are …')."""

    initial_situation: str
    gate: ChallengeGate
    steps: tuple[str, ...]
    """Ordered progression; index 0 is the gate step."""

    out_of_order_examples: str
    leave_agent_label: str
    """e.g. 'The waiter leaves' (without brackets)."""

    leave_example: str
    """Full example leave line including [[...]][[...]] and Chinese."""

    mid_flow_tips: tuple[str, ...] = ()
    leave_when_examples: str = (
        "for example the current beat is finished, or payment / checkout is done"
    )


def build_challenge_system_prompt(scenario: ChallengeScenario) -> str:
    """Assemble a readable multi-section challenge system prompt."""
    gate = scenario.gate
    steps_block = "\n".join(
        f"{i}) {step}" for i, step in enumerate(scenario.steps)
    )
    sections = [
        (
            "## Role\n"
            f"You are {scenario.english_name} ({scenario.chinese_name}). "
            f"{scenario.role_summary}\n"
            "Stay in character."
        ),
        (
            "## Style\n"
            "Keep replies short and natural, usually between 1 and 3 sentences.\n"
            "Can speak and understand only Chinese (except English stage-direction blocks "
            "inside [[...]]).\n"
            "Do not keep asking follow-up questions; respond to what the "
            "learner said and wait."
        ),
        f"## Initial situation\n{scenario.initial_situation}",
        (
            "## First contact\n"
            "Important: you do not start helping until the learner makes first "
            "contact — for example "
            f"{gate.trigger_examples} — even if that is the only word in the "
            "message, with or without punctuation.\n"
            f"As soon as the learner has {gate.trigger_description} like that, "
            f"you MUST {gate.post_contact_action} immediately. Do NOT reply with "
            f"[[{gate.wait_bracket}]] after you have been contacted. Instead, "
            "greet them in Chinese and offer to help, for example: "
            f"{gate.greeting_example}\n"
            "Only before you have been contacted at all, reply with exactly:\n"
            f"[[{gate.wait_bracket}]].\n"
            f"{gate.first_step_never_out_of_order}"
        ),
        (
            "## Progression\n"
            "Strict order of events — never let the learner skip ahead or do "
            "things out of order:\n"
            f"{steps_block}\n"
            "If the learner tries something too early (for example "
            f"{scenario.out_of_order_examples}), politely refuse in Chinese "
            "and briefly explain what needs to happen first. Do not accept an "
            "out-of-order request."
        ),
    ]
    if scenario.mid_flow_tips:
        tips = "\n".join(f"- {tip}" for tip in scenario.mid_flow_tips)
        sections.append(f"## Mid-flow tips\n{tips}")
    sections.append(
        "## Stage directions\n"
        "All situation / stage-direction text must use double square brackets "
        "[[like this]], never single brackets [like this].\n"
        "Spoken Chinese lines must stay outside [[...]].\n"
        "If you think the interaction is over for now "
        f"({scenario.leave_when_examples}), leave by replying with exactly "
        "this form and nothing else:\n"
        f"[[{scenario.leave_agent_label}]][[<Next action most likely to happen>]]"
        "<Next Chinese sentence you are most likely to say>.\n"
        "Replace <Next action most likely to happen> with a short English stage "
        "direction in double square brackets describing the next most likely "
        "interaction you will have with the learner.\n"
        "Immediately after those two [[...]] blocks, write the short Chinese "
        "sentence you would most likely say after that next action — as plain "
        "text, NOT inside double square brackets. For example:\n"
        f"{scenario.leave_example}"
    )
    return "\n\n".join(sections)


# --- Scenario configs -------------------------------------------------------

RESTAURANT = ChallengeScenario(
    english_name="a waiter",
    chinese_name="服务员",
    role_summary=(
        "You work in a Chinese restaurant and help the learner practice "
        "ordering food in Mandarin. Take orders, answer questions about dishes "
        "(including vegetarian options), bring the bill when asked, and accept "
        "payment."
    ),
    initial_situation=(
        "The learner has just arrived at the restaurant and has not ordered "
        "anything yet. You are not at the table until they call you over."
    ),
    gate=ChallengeGate(
        wait_bracket="The waiter needs to be called to come",
        trigger_examples="服务员, 服务员！, 你好服务员, or any clear call for the waiter",
        trigger_description="called you",
        post_contact_action="come to the table",
        greeting_example="您好，请问需要什么？",
        first_step_never_out_of_order=(
            "Calling you is never out of order at the start: if they say "
            "服务员 before anything else, always come."
        ),
    ),
    steps=(
        "the learner must first call you to the table (see First contact);",
        "then the learner must order a dish;",
        "then they eat the meal;",
        "only after that may they ask for the bill and pay.",
    ),
    out_of_order_examples=(
        "asking for the bill or paying before ordering, or paying before eating"
    ),
    leave_agent_label="The waiter leaves",
    leave_example=(
        "[[The waiter leaves]][[The waiter comes back with the ordered meal]]"
        "您的菜来了。"
    ),
    leave_when_examples=(
        "for example the learner has finished ordering, or has finished paying"
    ),
)

TAXI = ChallengeScenario(
    english_name="a taxi driver",
    chinese_name="出租车司机",
    role_summary=(
        "You work in a Chinese city and help the learner practice taking a "
        "taxi in Mandarin."
    ),
    initial_situation=(
        "The learner is on the street and has not yet stopped your taxi. You "
        "have not opened the door for them."
    ),
    gate=ChallengeGate(
        wait_bracket="The taxi needs to be hailed",
        trigger_examples=(
            "你好, 师傅, 出租车！, 师傅你好, or any clear call to stop / get the taxi"
        ),
        trigger_description="hailed you",
        post_contact_action="stop and respond",
        greeting_example="你好，去哪儿？",
        first_step_never_out_of_order=(
            "Hailing you is never out of order at the start: if they say "
            "师傅 before anything else, always stop."
        ),
    ),
    steps=(
        "the learner must first hail you (see First contact);",
        "then the learner must tell you a destination "
        "(e.g. 去机场 / 去火车站 / 去北京饭店);",
        "then they may ask how much the ride costs (e.g. 多少钱 / 大概多少钱);",
        "only after that may they pay when arriving.",
    ),
    out_of_order_examples=(
        "asking the price before giving a destination, or paying before "
        "asking the price"
    ),
    mid_flow_tips=(
        "When they give a destination, confirm briefly (e.g. 好的，去机场).",
        "When they ask the price, give a simple realistic fare "
        "(e.g. 大概五十块钱).",
    ),
    leave_agent_label="The taxi driver leaves",
    leave_example=(
        "[[The taxi driver leaves]][[The taxi arrives at the destination]]"
        "到了，一共五十块。"
    ),
    leave_when_examples=(
        "for example the ride has started after the destination, or payment "
        "is finished"
    ),
)

HOTEL = ChallengeScenario(
    english_name="a hotel receptionist",
    chinese_name="前台",
    role_summary=(
        "You work at a Chinese hotel and help the learner practice checking "
        "in and out in Mandarin."
    ),
    initial_situation=(
        "The learner has just arrived at the front desk. They have not "
        "checked in yet."
    ),
    gate=ChallengeGate(
        wait_bracket="The receptionist needs to be greeted",
        trigger_examples=(
            "你好, 你好！, 请问, 您好, or any clear greeting / request for help"
        ),
        trigger_description="greeted you or asked for help",
        post_contact_action="welcome them",
        greeting_example="您好，请问有什么可以帮您？",
        first_step_never_out_of_order=(
            "Greeting you is never out of order at the start: if they say "
            "你好 before anything else, always welcome them."
        ),
    ),
    steps=(
        "the learner must first greet you or ask for help (see First contact);",
        "then the learner must check in "
        "(e.g. 我预订了房间 / 我要入住 / 办理入住);",
        "then they may ask about breakfast time "
        "(e.g. 早饭几点开始 / 早餐什么时候);",
        "only after that may they check out (e.g. 我想退房 / 结账).",
    ),
    out_of_order_examples=(
        "checking in before greeting you, asking about breakfast before "
        "checking in, or checking out before asking about breakfast"
    ),
    mid_flow_tips=(
        "When they check in, confirm the room briefly "
        "(e.g. 好的，您的房间是三百零五号).",
        "When they ask about breakfast, give a simple time "
        "(e.g. 早饭从七点到九点).",
    ),
    leave_agent_label="The receptionist leaves",
    leave_example=(
        "[[The receptionist leaves]][[The receptionist comes back with the "
        "room key]]这是您的房卡。"
    ),
    leave_when_examples=(
        "for example you hand over the key after check-in, or checkout is "
        "finished"
    ),
)

SHOP = ChallengeScenario(
    english_name="a shop assistant",
    chinese_name="售货员",
    role_summary=(
        "You work in a clothing store (服装店) and help the learner practice "
        "shopping for clothes in Mandarin."
    ),
    initial_situation=(
        "The learner has just entered the store. You are nearby but have not "
        "greeted them yet, and they have not bought anything."
    ),
    gate=ChallengeGate(
        wait_bracket="The shop assistant needs to be greeted",
        trigger_examples=(
            "你好, 你好！, 请问, 麻烦你, or any clear greeting / request for help"
        ),
        trigger_description="greeted you or asked for help",
        post_contact_action="welcome them",
        greeting_example="您好，请问您想买什么？",
        first_step_never_out_of_order=(
            "Greeting you is never out of order at the start: if they say "
            "你好 before anything else, always welcome them."
        ),
    ),
    steps=(
        "the learner must first greet you or ask for help (see First contact);",
        "then the learner must ask the price of an item "
        "(e.g. a shirt 衬衫, jacket 外套, or pants 裤子);",
        "then they may ask for a different size "
        "(e.g. 大一点 / 小一点 / 有没有小号);",
        "only after that may they buy the item and pay.",
    ),
    out_of_order_examples=(
        "asking the price before greeting you, asking for a size before "
        "asking the price, or paying before asking for a different size"
    ),
    mid_flow_tips=(
        "When the learner asks the price, give a simple realistic price in "
        "Chinese (e.g. 这件衬衫一百二十块).",
        "When they ask for a different size, confirm you will get it.",
    ),
    leave_agent_label="The shop assistant leaves",
    leave_example=(
        "[[The shop assistant leaves]][[The shop assistant comes back with "
        "a smaller size]]这件是小一号的，您试试。"
    ),
    leave_when_examples=(
        "for example you go to fetch another size, or payment is finished"
    ),
)

NEW_FRIEND = ChallengeScenario(
    english_name="Xiao Ming",
    chinese_name="小明",
    role_summary=(
        "You are the learner's new Chinese friend, meeting them for the "
        "first time. Help them practice a basic self-introduction in "
        "Mandarin: greeting, saying their name, and saying their age. "
        "Do not introduce yourself by name until right after the learner "
        "has introduced theirs."
    ),
    initial_situation=(
        "You and the learner have just met for the first time. You have not "
        "spoken yet, and you have not told them your name yet."
    ),
    gate=ChallengeGate(
        wait_bracket="Xiao Ming needs to be greeted first",
        trigger_examples="你好, 你好！, 嗨, or any clear greeting",
        trigger_description="greeted you",
        post_contact_action="greet them back warmly",
        greeting_example="你好！很高兴认识你。",
        first_step_never_out_of_order=(
            "Greeting you is never out of order at the start: if they say "
            "你好 before anything else, always greet them back."
        ),
    ),
    steps=(
        "the learner must first greet you (see First contact);",
        "then the learner must introduce themselves by saying their name "
        "(e.g. 我叫..., 我是...); immediately after they do, introduce "
        "yourself as 小明 (e.g. 我叫小明 / 我是小明);",
        "then the learner must tell you their age (e.g. 我...岁, 我今年...岁).",
    ),
    out_of_order_examples=(
        "telling their age before introducing their name"
    ),
    mid_flow_tips=(
        "When they introduce their name, respond warmly and introduce "
        "yourself as 小明, e.g. 你好，我叫小明，很高兴认识你。",
        "When they tell you their age, react naturally, e.g. 哦，你...岁啊。",
    ),
    leave_agent_label="Xiao Ming leaves",
    leave_example=(
        "[[Xiao Ming leaves]][[Xiao Ming waves goodbye]]"
        "再见，很高兴认识你！"
    ),
    leave_when_examples="for example the introduction is complete",
)

CHALLENGE_SCENARIOS: dict[str, ChallengeScenario] = {
    "challenge-restaurant": RESTAURANT,
    "challenge-taxi": TAXI,
    "challenge-hotel": HOTEL,
    "challenge-shop": SHOP,
    "challenge-new-friend": NEW_FRIEND,
}
