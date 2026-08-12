import type { ChatMessage } from "../../types/chat";
import { trimMessagesForContext } from "./chatContextWindow";

// Builds a conversation with `userCount` user turns: user/assistant pairs,
// ending on an unanswered user message (mirrors ChatModal's `nextMessages`,
// which is sent before the assistant's reply for this turn exists).
function makeConversation(userCount: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < userCount - 1; i += 1) {
    messages.push({ role: "user", content: `u${i}` });
    messages.push({ role: "assistant", content: `a${i}` });
  }
  messages.push({ role: "user", content: `u${userCount - 1}` });
  return messages;
}

describe("trimMessagesForContext", () => {
  it("returns the full history below the trim threshold, counting only user messages", () => {
    // 7 user turns (with 6 interleaved assistant replies) is still below
    // the 8-user-message threshold.
    const messages = makeConversation(7);
    expect(trimMessagesForContext(messages)).toEqual(messages);
  });

  it("sends remainder + 4 latest user turns when remainder < 3", () => {
    // 8 user messages => 8 % 4 = 0 < 3 => 0 + 4 = 4 latest user turns,
    // which pull in their interleaved assistant replies too (7 raw messages).
    const messages = makeConversation(8);
    expect(trimMessagesForContext(messages)).toEqual(messages.slice(-7));
  });

  it("sends remainder latest user turns when remainder >= 3", () => {
    // 11 user messages => 11 % 4 = 3 >= 3 => 3 latest user turns (5 raw messages)
    const messages = makeConversation(11);
    expect(trimMessagesForContext(messages)).toEqual(messages.slice(-5));
  });

  it("sends a full 4-user-turn window right on a trigger boundary", () => {
    // 12 user messages => 12 % 4 = 0 < 3 => 0 + 4 = 4 latest user turns (7 raw messages)
    const messages = makeConversation(12);
    expect(trimMessagesForContext(messages)).toEqual(messages.slice(-7));
  });
});
