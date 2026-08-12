import type { ChatMessage } from "../../types/chat";

// Keep in sync with
// backend.utils.aiChat.conversation_summary.MIN_MESSAGES_FOR_CONTEXT_SUMMARY /
// SUMMARY_TRIGGER_MESSAGE_COUNT. Both count only the learner's own ("user")
// messages, not assistant replies.
export const MIN_USER_MESSAGES_FOR_CONTEXT_TRIM = 8;
const CONTEXT_WINDOW = 4;

function countUserMessages(messages: ChatMessage[]): number {
  return messages.reduce(
    (count, message) => count + (message.role === "user" ? 1 : 0),
    0,
  );
}

// Tail of `messages` covering the newest `userTurns` user messages, plus
// whatever assistant messages are interleaved in that span (so the raw
// count returned is typically close to double `userTurns`).
function lastNUserTurns(messages: ChatMessage[], userTurns: number): ChatMessage[] {
  if (userTurns <= 0) {
    return [];
  }

  let seen = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      seen += 1;
      if (seen === userTurns) {
        return messages.slice(index);
      }
    }
  }
  return messages;
}

/**
 * Once a conversation is long enough, only send the newest messages and let
 * the backend fill in the rest from its stored conversation summary.
 */
export function trimMessagesForContext(messages: ChatMessage[]): ChatMessage[] {
  const userMessageCount = countUserMessages(messages);
  if (userMessageCount < MIN_USER_MESSAGES_FOR_CONTEXT_TRIM) {
    return messages;
  }

  const remainder = userMessageCount % CONTEXT_WINDOW;
  const userTurnsToSend = remainder < 3 ? remainder + CONTEXT_WINDOW : remainder;
  return lastNUserTurns(messages, userTurnsToSend);
}
