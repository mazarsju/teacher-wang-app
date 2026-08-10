from dataclasses import dataclass, field
import json
import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.behavior_spec import ALWAYS_ON_BEHAVIOR_IDS, BEHAVIORS, BEHAVIOR_IDS
from backend.chat_agents import get_character, get_system_prompt
from backend.chinese_validation import extract_han_characters
from backend.llm import get_llm
from backend.models import Character

logger = logging.getLogger(__name__)

VALID_ROLES = {"user", "assistant"}
MAX_REPHRASE_ATTEMPTS = 3
TEACHER_CHARACTER_ID = "teacher-wang"
GRAMMAR_SEVERITIES = frozenset({"none", "minor", "awkward", "incorrect"})
GRAMMAR_CHECK_INSTRUCTION = (
    "Check the learner's Chinese message and assign a grammar severity. "
    "If an AI character previous statement is given, use it as context: a short "
    "reply (e.g. a single word or noun phrase) that correctly answers the "
    "question or fills the blank it sets up is grammatically fine on its own "
    "and should not be marked incorrect for lacking a verb or full sentence "
    "structure. "
    "Reply with ONLY a JSON object and no other text. "
    "Choose exactly one severity: "
    '"none" (the sentence is grammatically correct), '
    '"minor" (a small pedantic nitpick only a picky teacher would mention), '
    '"awkward" (not strictly ungrammatical, but the word choice is strange, '
    "misleading, or likely not what the learner meant), "
    '"incorrect" (the sentence is grammatically wrong). '
    'If severity is "none", respond exactly: {"severity": "none"}. '
    "Otherwise the \"answer\" field must mix English and Chinese: use English "
    "to explain the grammar rule or mistake, and Chinese only for the "
    "corrected example phrase. Respond exactly: "
    '{"severity": "<minor|awkward|incorrect>", '
    '"answer": "<brief correction and explanation>"}.'
)


@dataclass(frozen=True)
class LlmTokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens

    def __add__(self, other: "LlmTokenUsage") -> "LlmTokenUsage":
        return LlmTokenUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )

    def to_dict(self) -> dict[str, int]:
        return {
            "input": self.input_tokens,
            "output": self.output_tokens,
            "total": self.total,
        }


@dataclass(frozen=True)
class ChatReplyResult:
    content: str
    unknown_characters: list[list[str]]
    system_prompt: str
    token_usage: LlmTokenUsage = LlmTokenUsage()
    behavior_ids: list[str] = field(default_factory=list)
    behavior_failures: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class GrammarCorrection:
    severity: str
    answer: str | None = None
    token_usage: LlmTokenUsage = LlmTokenUsage()

    @property
    def needs_explanation(self) -> bool:
        return self.severity != "none"

    def to_dict(self) -> dict:
        payload: dict = {"severity": self.severity}
        if self.needs_explanation and self.answer is not None:
            payload["answer"] = self.answer
        return payload


@dataclass(frozen=True)
class ChallengeJudgeResult:
    completed_task_ids: list[str]
    coherent: bool = True
    incoherence_reason: str | None = None
    token_usage: LlmTokenUsage = LlmTokenUsage()


@dataclass(frozen=True)
class ChallengeReplyResult:
    content: str
    unknown_characters: list[list[str]]
    completed_task_ids: list[str]
    judge_conversation: list[dict[str, str]]
    system_prompt: str
    token_usage: LlmTokenUsage = LlmTokenUsage()


CHALLENGE_JUDGE_SYSTEM_PROMPT = (
    "You are the Challenge Judge for a Mandarin learning app. "
    "You review a conversation between a learner and a role-play character. "
    "You have two jobs on every turn. "
    "First, decide which challenge tasks the learner has clearly accomplished. "
    "A task is completed only when BOTH of these are true: "
    "(1) the learner clearly attempted the task in Chinese "
    "(do not accept attempts in any other language), and "
    "(2) the character accepted / cooperated with that request or action. "
    "If the learner asks for something but the character refuses, rejects it, "
    "says it is too early, does not understand, or otherwise does not allow it, "
    "that task is NOT completed. "
    "Example: if the learner asks to pay the bill and the character refuses, "
    "do not mark a pay-the-bill task as completed. "
    "Stage-direction lines in [[double square brackets]] are narrative only; "
    "they do not by themselves complete a task. "
    "Second, decide whether the character's LATEST reply is coherent given "
    "the situation and conversation so far. "
    "A reply is coherent when it stays in character, respects the scenario's "
    "logical progression / rules, and is a sensible response to the learner's "
    "latest message. "
    "A reply is NOT coherent when it skips ahead, accepts an out-of-order "
    "request, contradicts established situation state, invents actions that "
    "should not have happened yet, or otherwise breaks the role-play logic. "
    "Reply with ONLY a JSON object and no other text, exactly in this form: "
    '{"completed_task_ids": ["task-id-1", "task-id-2"], '
    '"coherent": true}. '
    "When the latest character reply is not coherent, respond exactly: "
    '{"completed_task_ids": ["task-id-1"], "coherent": false, '
    '"incoherence_reason": "<brief explanation of why the reply is incoherent '
    'and what the character should do instead>"}. '
    "Include every task that is completed based on the full conversation so far. "
    "If none are completed, use an empty completed_task_ids list. "
    "incoherence_reason is required when coherent is false, and must be omitted "
    "or null when coherent is true."
)


def _llm_response_text(response) -> str:
    content = response.content

    if isinstance(content, str):
        text = content.strip()
        if text:
            return text

    if isinstance(content, list):
        text_parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        ]
        combined = "".join(text_parts).strip()
        if combined:
            return combined

    raise ValueError("The LLM returned an empty response")


def _tokens_from_response(response) -> LlmTokenUsage:
    usage = getattr(response, "usage_metadata", None)
    if isinstance(usage, dict):
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if isinstance(input_tokens, int) and isinstance(output_tokens, int):
            return LlmTokenUsage(
                input_tokens=max(0, input_tokens),
                output_tokens=max(0, output_tokens),
            )

        total = usage.get("total_tokens")
        if isinstance(total, int) and total >= 0:
            # Fallback when the provider only reports a combined total.
            return LlmTokenUsage(input_tokens=total, output_tokens=0)

    metadata = getattr(response, "response_metadata", None)
    if isinstance(metadata, dict):
        token_usage = metadata.get("token_usage") or metadata.get("usage") or {}
        if isinstance(token_usage, dict):
            prompt_tokens = token_usage.get("prompt_tokens")
            completion_tokens = token_usage.get("completion_tokens")
            if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
                return LlmTokenUsage(
                    input_tokens=max(0, prompt_tokens),
                    output_tokens=max(0, completion_tokens),
                )

            total = token_usage.get("total_tokens")
            if isinstance(total, int) and total >= 0:
                return LlmTokenUsage(input_tokens=total, output_tokens=0)

    return LlmTokenUsage()


def _invoke_llm(messages) -> tuple[str, LlmTokenUsage]:
    from backend.models import DEFAULT_USER_PLAN
    from backend.settings import assert_free_plan_has_tokens, deduct_available_token
    from backend.user_context import current_user

    user = current_user()
    assert_free_plan_has_tokens(user)

    response = get_llm().invoke(messages)
    text = _llm_response_text(response)
    usage = _tokens_from_response(response)

    if user.plan == DEFAULT_USER_PLAN and usage.total > 0:
        deduct_available_token(user.shortid, usage.total, commit=True)

    return text, usage


def find_unknown_characters(
    text: str,
    known_characters: set[str] | None = None,
    *,
    user_id: str | None = None,
) -> list[str]:
    """Return Han characters in ``text`` that are not in the learner's vocabulary."""
    if known_characters is None:
        if user_id is None:
            raise ValueError("user_id is required to read the learner's characters")
        known_characters = _known_characters(user_id)

    unknown = extract_han_characters(text) - known_characters
    return sorted(unknown)


def _known_characters(user_id: str) -> set[str]:
    return {row.char for row in Character.query.filter_by(user_id=user_id).all()}


def _rephrase_instruction(unknown_characters: list[str]) -> str:
    listed = "、".join(unknown_characters)
    return (
        "Please rephrase your previous reply without using these Chinese "
        f"characters the learner does not know yet: {listed}. Keep the same "
        "meaning, stay in character, and avoid introducing other unknown "
        "characters."
    )


def _coherence_revision_instruction(reason: str) -> str:
    return (
        "The Challenge Judge found your previous reply incoherent for this "
        "situation. "
        f"Reason: {reason.strip()} "
        "Please revise your reply so it is coherent. Stay in character and "
        "reply with only your new in-character message."
    )


def _judge_revision_request(reason: str) -> str:
    return (
        "Your reply is not coherent given the situation. "
        f"{reason.strip()} "
        "Please modify your answer."
    )


def _best_attempt(
    attempts: list[tuple[str, list[str]]],
) -> tuple[str, list[str]]:
    """Pick the earliest reply that has the fewest unknown characters."""
    best_index = min(
        range(len(attempts)),
        key=lambda index: (len(attempts[index][1]), index),
    )
    return attempts[best_index]


def _extract_json_object(text: str) -> dict:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fenced:
        stripped = fenced.group(1).strip()
    else:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1 and end > start:
            stripped = stripped[start : end + 1]

    parsed = json.loads(stripped)
    if not isinstance(parsed, dict):
        raise ValueError("Grammar check response must be a JSON object")
    return parsed


def check_user_grammar(
    user_id: str,
    user_message: str,
    previous_ai_message: str | None = None,
) -> GrammarCorrection:
    """Ask Teacher Wang to rate the learner's message grammar severity."""
    content = user_message.strip()
    if content == "":
        raise ValueError("Message content must be a non-empty string")

    previous_ai_message = (previous_ai_message or "").strip()
    if previous_ai_message:
        prompt = (
            f'AI character previous statement: "{previous_ai_message}", '
            f'User response: "{content}"'
        )
    else:
        prompt = f'User response: "{content}"'

    messages = [
        SystemMessage(
            content=(
                f"{get_system_prompt(user_id, TEACHER_CHARACTER_ID)} "
                f"{GRAMMAR_CHECK_INSTRUCTION}"
            )
        ),
        HumanMessage(content=prompt),
    ]
    raw, token_usage = _invoke_llm(messages)
    parsed = _extract_json_object(raw)

    severity = parsed.get("severity")
    if not isinstance(severity, str) or severity not in GRAMMAR_SEVERITIES:
        raise ValueError(
            "Grammar check response must include severity "
            "('none', 'minor', 'awkward', or 'incorrect')"
        )

    if severity == "none":
        return GrammarCorrection(severity="none", token_usage=token_usage)

    answer = parsed.get("answer")
    if not isinstance(answer, str) or answer.strip() == "":
        raise ValueError(
            "Grammar check response must include non-empty 'answer' "
            f"when severity is '{severity}'"
        )

    return GrammarCorrection(
        severity=severity,
        answer=answer.strip(),
        token_usage=token_usage,
    )


def _format_challenge_transcript(messages: list[dict[str, str]]) -> str:
    lines: list[str] = []
    for message in messages:
        role = message["role"]
        speaker = "Learner" if role == "user" else "Character"
        lines.append(f"{speaker}: {message['content'].strip()}")
    return "\n".join(lines)


def _parse_completed_task_ids(raw_ids, valid_task_ids: set[str]) -> list[str]:
    if not isinstance(raw_ids, list):
        raise ValueError("Challenge judge response must include completed_task_ids list")

    completed_task_ids: list[str] = []
    for task_id in raw_ids:
        if not isinstance(task_id, str):
            continue
        normalized = task_id.strip()
        if normalized in valid_task_ids and normalized not in completed_task_ids:
            completed_task_ids.append(normalized)
    return completed_task_ids


def _parse_coherence(parsed: dict) -> tuple[bool, str | None]:
    coherent = parsed.get("coherent")
    if not isinstance(coherent, bool):
        raise ValueError("Challenge judge response must include boolean 'coherent'")

    if coherent:
        return True, None

    reason = parsed.get("incoherence_reason")
    if not isinstance(reason, str) or reason.strip() == "":
        raise ValueError(
            "Challenge judge response must include non-empty "
            "'incoherence_reason' when coherent is false"
        )
    return False, reason.strip()


def judge_challenge_progress(
    messages: list[dict[str, str]],
    tasks: list[dict[str, str]],
) -> ChallengeJudgeResult:
    """Ask the Challenge Judge which tasks are done and if the reply is coherent."""
    if not messages:
        return ChallengeJudgeResult(completed_task_ids=[], coherent=True)

    if not tasks:
        raise ValueError("At least one challenge task is required")

    valid_task_ids = set()
    task_lines: list[str] = []
    for task in tasks:
        task_id = task.get("id")
        label = task.get("label")
        if not isinstance(task_id, str) or task_id.strip() == "":
            raise ValueError("Each challenge task must include a non-empty id")
        if not isinstance(label, str) or label.strip() == "":
            raise ValueError("Each challenge task must include a non-empty label")
        valid_task_ids.add(task_id)
        task_lines.append(f"- {task_id}: {label.strip()}")

    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role not in VALID_ROLES:
            raise ValueError(f"Invalid message role: {role}")
        if not isinstance(content, str) or content.strip() == "":
            raise ValueError("Message content must be a non-empty string")

    if messages[-1].get("role") != "assistant":
        raise ValueError("The last message must be from the assistant for judging")

    prompt = (
        "Challenge tasks:\n"
        f"{chr(10).join(task_lines)}\n\n"
        "Conversation so far:\n"
        f"{_format_challenge_transcript(messages)}\n\n"
        "Return the JSON object with completed_task_ids and coherent."
    )

    raw, token_usage = _invoke_llm(
        [
            SystemMessage(content=CHALLENGE_JUDGE_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]
    )
    parsed = _extract_json_object(raw)
    completed_task_ids = _parse_completed_task_ids(
        parsed.get("completed_task_ids"),
        valid_task_ids,
    )
    coherent, incoherence_reason = _parse_coherence(parsed)

    return ChallengeJudgeResult(
        completed_task_ids=completed_task_ids,
        coherent=coherent,
        incoherence_reason=incoherence_reason,
        token_usage=token_usage,
    )


BEHAVIOR_PLANNER_SYSTEM_PROMPT = (
    "You are the Behavior Planner for Teacher Wang, a Mandarin teaching "
    "agent. Given the learner's latest message and the conversation so "
    "far, decide which of the following behaviors apply to this turn. "
    'Reply with ONLY a JSON object: {"behavior_ids": ["BHV-01", ...]}, '
    "including every behavior whose 'Applies when' condition is met and "
    "omitting the rest.\n\nBehavior catalog:\n"
)

BEHAVIOR_VALIDATOR_SYSTEM_PROMPT = (
    "You are the Behavior Validator for Teacher Wang, a Mandarin teaching "
    "agent. You are given a generated reply and the behaviors that were "
    "selected as applicable to it. For each behavior, check whether the "
    "reply satisfies its success criteria. Reply with ONLY a JSON object: "
    '{"failed_behavior_ids": ["BHV-01", ...]}, listing only the behaviors '
    "the reply fails to satisfy. Use an empty list if it satisfies all of "
    "them."
)


def _format_behavior_catalog(behaviors: list[dict]) -> str:
    return "\n".join(
        f"- {behavior['id']} ({behavior['title']}): {behavior['objective']} "
        f"Applies when: {behavior['applies_when']}"
        for behavior in behaviors
    )


def _format_behavior_criteria(behaviors: list[dict]) -> str:
    return "\n".join(
        f"- {behavior['id']} ({behavior['title']}): {behavior['success_criteria']}"
        for behavior in behaviors
    )


def _format_conversation_context(messages: list[dict[str, str]]) -> str:
    return "\n".join(f"{message['role']}: {message['content']}" for message in messages[:-1])


def _dedup_known_ids(raw_ids, known_ids: frozenset[str]) -> list[str]:
    if not isinstance(raw_ids, list):
        return []
    return [
        behavior_id
        for behavior_id in dict.fromkeys(raw_ids)
        if behavior_id in known_ids
    ]


def select_behaviors(
    user_message: str, conversation_context: str = ""
) -> tuple[list[str], LlmTokenUsage]:
    """Plan which behavior specification IDs apply to this learner turn."""
    system = BEHAVIOR_PLANNER_SYSTEM_PROMPT + _format_behavior_catalog(BEHAVIORS)
    prompt = f'Learner\'s latest message: "{user_message}"'
    if conversation_context:
        prompt = f"Conversation so far:\n{conversation_context}\n\n{prompt}"

    raw, token_usage = _invoke_llm(
        [SystemMessage(content=system), HumanMessage(content=prompt)]
    )
    parsed = _extract_json_object(raw)
    return _dedup_known_ids(parsed.get("behavior_ids"), BEHAVIOR_IDS), token_usage


def _behavior_requirements_block(behavior_ids: list[str]) -> str:
    selected = [behavior for behavior in BEHAVIORS if behavior["id"] in behavior_ids]
    if not selected:
        return ""
    lines = "\n".join(f"- {behavior['title']}: {behavior['requirements']}" for behavior in selected)
    return f"Apply these teaching requirements in your reply:\n{lines}"


def validate_behaviors(
    reply_content: str, behavior_ids: list[str]
) -> tuple[list[str], LlmTokenUsage]:
    """Check a generated reply against the selected behaviors' success criteria."""
    selected = [behavior for behavior in BEHAVIORS if behavior["id"] in behavior_ids]
    if not selected:
        return [], LlmTokenUsage()

    prompt = (
        f'Reply to check:\n"""\n{reply_content}\n"""\n\n'
        f"Behaviors to check against:\n{_format_behavior_criteria(selected)}"
    )
    raw, token_usage = _invoke_llm(
        [
            SystemMessage(content=BEHAVIOR_VALIDATOR_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]
    )
    parsed = _extract_json_object(raw)
    return _dedup_known_ids(parsed.get("failed_behavior_ids"), BEHAVIOR_IDS), token_usage


def generate_chat_reply(
    user_id: str,
    character_id: str,
    messages: list[dict[str, str]],
    *,
    previous_assistant_reply: str | None = None,
    revision_instruction: str | None = None,
) -> ChatReplyResult:
    if not messages:
        raise ValueError("At least one message is required")

    if (previous_assistant_reply is None) != (revision_instruction is None):
        raise ValueError(
            "previous_assistant_reply and revision_instruction must be provided together"
        )

    system_prompt = get_system_prompt(user_id, character_id)
    token_usage = LlmTokenUsage()
    behavior_ids: list[str] = []

    if character_id == TEACHER_CHARACTER_ID and revision_instruction is None:
        planned_ids, plan_usage = select_behaviors(
            messages[-1]["content"], _format_conversation_context(messages)
        )
        token_usage = token_usage + plan_usage
        # Behaviors that apply to every turn are guaranteed here rather than
        # left to the planner's judgment call.
        behavior_ids = list(dict.fromkeys([*ALWAYS_ON_BEHAVIOR_IDS, *planned_ids]))
        behavior_block = _behavior_requirements_block(behavior_ids)
        if behavior_block:
            system_prompt = f"{system_prompt}\n\n{behavior_block}"

    langchain_messages = [SystemMessage(content=system_prompt)]

    for message in messages:
        role = message["role"]
        content = message["content"].strip()

        if role not in VALID_ROLES:
            raise ValueError(f"Invalid message role: {role}")

        if content == "":
            raise ValueError("Message content must be a non-empty string")

        if role == "user":
            langchain_messages.append(HumanMessage(content=content))
        else:
            langchain_messages.append(AIMessage(content=content))

    if messages[-1]["role"] != "user":
        raise ValueError("The last message must be from the user")

    if previous_assistant_reply is not None and revision_instruction is not None:
        revised = previous_assistant_reply.strip()
        instruction = revision_instruction.strip()
        if revised == "" or instruction == "":
            raise ValueError("Revision reply and instruction must be non-empty")
        langchain_messages.append(AIMessage(content=revised))
        langchain_messages.append(HumanMessage(content=instruction))

    character = get_character(character_id)
    reply, reply_usage = _invoke_llm(langchain_messages)
    token_usage = token_usage + reply_usage

    behavior_failures: list[str] = []
    if behavior_ids:
        behavior_failures, validate_usage = validate_behaviors(reply, behavior_ids)
        token_usage = token_usage + validate_usage
        if behavior_failures:
            logger.warning(
                "Teacher Wang reply failed behaviors %s for user %s",
                behavior_failures,
                user_id,
            )

    if not character.get("retry_unknown_characters", False):
        return ChatReplyResult(
            content=reply,
            unknown_characters=[],
            system_prompt=system_prompt,
            token_usage=token_usage,
            behavior_ids=behavior_ids,
            behavior_failures=behavior_failures,
        )

    known_characters = _known_characters(user_id)
    attempts: list[tuple[str, list[str]]] = []

    while True:
        unknown_characters = find_unknown_characters(reply, known_characters)
        attempts.append((reply, unknown_characters))

        if not unknown_characters:
            break

        if len(attempts) > MAX_REPHRASE_ATTEMPTS:
            break

        langchain_messages.append(AIMessage(content=reply))
        langchain_messages.append(
            HumanMessage(content=_rephrase_instruction(unknown_characters))
        )
        reply, attempt_usage = _invoke_llm(langchain_messages)
        token_usage = token_usage + attempt_usage

    best_content, best_unknowns = _best_attempt(attempts)
    return ChatReplyResult(
        content=best_content,
        unknown_characters=(
            [unknowns for _, unknowns in attempts] if best_unknowns else []
        ),
        system_prompt=system_prompt,
        token_usage=token_usage,
    )


def generate_challenge_reply(
    user_id: str,
    character_id: str,
    messages: list[dict[str, str]],
    tasks: list[dict[str, str]],
) -> ChallengeReplyResult:
    """Generate a challenge reply, allowing one coherence revision from the judge."""
    reply = generate_chat_reply(user_id, character_id, messages)
    token_usage = reply.token_usage
    judge_conversation: list[dict[str, str]] = []

    conversation_for_judge = [
        *messages,
        {"role": "assistant", "content": reply.content},
    ]
    judgment = judge_challenge_progress(conversation_for_judge, tasks)
    token_usage = token_usage + judgment.token_usage

    if not judgment.coherent:
        assert judgment.incoherence_reason is not None
        refused_reply = reply.content
        judge_conversation.append({"role": "assistant", "content": refused_reply})
        judge_conversation.append(
            {
                "role": "judge",
                "content": _judge_revision_request(judgment.incoherence_reason),
            }
        )

        revised = generate_chat_reply(
            user_id,
            character_id,
            messages,
            previous_assistant_reply=refused_reply,
            revision_instruction=_coherence_revision_instruction(
                judgment.incoherence_reason
            ),
        )
        token_usage = token_usage + revised.token_usage
        reply = revised

        conversation_for_judge = [
            *messages,
            {"role": "assistant", "content": reply.content},
        ]
        second_judgment = judge_challenge_progress(conversation_for_judge, tasks)
        token_usage = token_usage + second_judgment.token_usage
        judgment = second_judgment

        # One opposition only: accept the revised reply even if still incoherent.
        # The final character reply is omitted here — it is returned as message.content.
        if not second_judgment.coherent and second_judgment.incoherence_reason:
            judge_conversation.append(
                {
                    "role": "judge",
                    "content": (
                        "The revised reply is still not coherent, but it will "
                        f"be sent anyway. {second_judgment.incoherence_reason}"
                    ),
                }
            )

    return ChallengeReplyResult(
        content=reply.content,
        unknown_characters=reply.unknown_characters,
        completed_task_ids=judgment.completed_task_ids,
        judge_conversation=judge_conversation,
        system_prompt=reply.system_prompt,
        token_usage=token_usage,
    )
