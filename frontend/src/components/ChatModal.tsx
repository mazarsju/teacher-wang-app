import { useEffect, useState, type FormEvent } from "react";
import type { ChatCharacter } from "./ChatCharacterCard";
import ChatCharacterAvatar from "./ChatCharacterAvatar";
import ConfirmModal from "./ConfirmModal";
import { CloseIcon, TrashIcon, WarningIcon } from "./icons";
import { TEACHER_WANG } from "../data/chatCharacters";
import type { ChallengeTask } from "../types/challenge";
import type { ChatMessage, ChatThreadContext } from "../types/chat";
import {
  clearChatHistory,
  fetchChatHistory,
  sendChatMessage,
} from "../utils/chatApi";
import { getStageDirectionText } from "../utils/stageDirection";

type CorrectionThreadState = {
  messageIndex: number;
  threadId: string;
  messages: ChatMessage[];
};

type ChatModalProps = {
  character: ChatCharacter | null;
  onClose: () => void;
  initialMessages?: ChatMessage[];
  loadHistory?: boolean;
  stacked?: boolean;
  allowClearHistory?: boolean;
  thread?: ChatThreadContext;
  onThreadMessagesChange?: (messages: ChatMessage[]) => void;
  tasks?: ChallengeTask[];
  challengeTitle?: string;
};

function hasCorrectionThread(message: ChatMessage): boolean {
  return Boolean(
    message.correctionThreadId ||
      (message.correctionThread && message.correctionThread.length > 0) ||
      message.correctionAnswer,
  );
}

function getCorrectionThreadMessages(message: ChatMessage): ChatMessage[] {
  if (message.correctionThread && message.correctionThread.length > 0) {
    return message.correctionThread;
  }

  if (message.correctionAnswer) {
    return [{ role: "assistant", content: message.correctionAnswer }];
  }

  return [];
}

export default function ChatModal({
  character,
  onClose,
  initialMessages,
  loadHistory = true,
  stacked = false,
  allowClearHistory = true,
  thread,
  onThreadMessagesChange,
  tasks,
  challengeTitle,
}: ChatModalProps) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCorrection, setActiveCorrection] =
    useState<CorrectionThreadState | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (character === null) {
      return;
    }

    let isMounted = true;

    setMessage("");
    setError(null);
    setIsSending(false);
    setIsClearing(false);
    setIsClearConfirmOpen(false);
    setActiveCorrection(null);
    setCompletedTaskIds(new Set());

    if (!loadHistory) {
      setMessages(initialMessages ?? []);
      setIsLoadingHistory(false);
      return;
    }

    setMessages([]);
    setIsLoadingHistory(true);

    void fetchChatHistory(character.id)
      .then((history) => {
        if (isMounted) {
          setMessages(history.messages);
          setCompletedTaskIds(new Set(history.completedTaskIds));
        }
      })
      .catch((historyError) => {
        if (isMounted) {
          setError(
            historyError instanceof Error
              ? historyError.message
              : "Failed to load chat history.",
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      isMounted = false;
    };
    // initialMessages is only applied when loadHistory is false on mount/open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, loadHistory, thread?.threadId]);

  if (character === null) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (trimmedMessage === "" || isSending || isClearing) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: trimmedMessage };
    const nextMessages: ChatMessage[] = [...messages, userMessage];

    setMessages(nextMessages);
    setMessage("");
    setError(null);
    setIsSending(true);

    try {
      const response = await sendChatMessage(
        character.id,
        nextMessages,
        thread,
      );
      const updatedMessages = (() => {
        if (thread) {
          return [...nextMessages, response.message];
        }

        const withCorrection =
          response.correction &&
          response.correction.correct === false &&
          response.correction.answer
            ? nextMessages.map((entry, index) =>
                index === nextMessages.length - 1 && entry.role === "user"
                  ? {
                      ...entry,
                      correctionAnswer: response.correction?.answer,
                      correctionThreadId: response.correction?.thread_id,
                      correctionThread:
                        response.correction?.thread_messages ?? [
                          {
                            role: "assistant" as const,
                            content: response.correction?.answer ?? "",
                          },
                        ],
                    }
                  : entry,
              )
            : nextMessages;

        return [...withCorrection, response.message];
      })();

      setMessages(updatedMessages);
      onThreadMessagesChange?.(updatedMessages);
      if (response.completed_task_ids) {
        setCompletedTaskIds(new Set(response.completed_task_ids));
      }
    } catch (sendError) {
      setMessages(messages);
      setMessage(trimmedMessage);
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send chat message.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleClearHistory() {
    if (isClearing || isSending || messages.length === 0 || !allowClearHistory) {
      return;
    }

    setIsClearConfirmOpen(false);
    setIsClearing(true);
    setError(null);

    try {
      await clearChatHistory(character.id);
      setMessages([]);
      setMessage("");
      setCompletedTaskIds(new Set());
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to clear chat history.",
      );
    } finally {
      setIsClearing(false);
    }
  }

  function openCorrectionThread(messageIndex: number, chatMessage: ChatMessage) {
    const threadMessages = getCorrectionThreadMessages(chatMessage);
    if (threadMessages.length === 0) {
      return;
    }

    if (!chatMessage.correctionThreadId) {
      setError(
        "This grammar note can’t continue as a saved thread. Send a new message to create one.",
      );
      return;
    }

    setActiveCorrection({
      messageIndex,
      threadId: chatMessage.correctionThreadId,
      messages: threadMessages,
    });
  }

  return (
    <>
      <div
        className={
          stacked ? "modal-overlay modal-overlay--stacked" : "modal-overlay"
        }
        onClick={onClose}
      >
        <div
          className="chat-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="chat-modal-header">
            <div className="chat-modal-participant">
              <ChatCharacterAvatar
                variant={character.avatarVariant}
                className="chat-character-avatar-image--compact"
              />
              <div className="chat-modal-participant-text">
                <h2 id="chat-modal-title" className="chat-modal-participant-name">
                  {character.name}{" "}
                  <span className="chat-modal-participant-chinese-name">
                    ({character.chineseName})
                  </span>
                </h2>
              </div>
            </div>
            <div className="chat-modal-header-actions">
              {allowClearHistory && (
                <button
                  type="button"
                  className="chat-modal-clear-button"
                  disabled={
                    isLoadingHistory ||
                    isSending ||
                    isClearing ||
                    messages.length === 0
                  }
                  onClick={() => setIsClearConfirmOpen(true)}
                >
                  <TrashIcon className="chat-modal-clear-icon" />
                  <span>
                    {isClearing ? "Clearing..." : "Clear chat history"}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="chat-modal-close-button"
                aria-label="Close chat"
                onClick={onClose}
              >
                <CloseIcon className="chat-modal-close-icon" />
              </button>
            </div>
          </header>

          {tasks && tasks.length > 0 && (
            <section
              className="chat-modal-tasks"
              aria-labelledby="chat-modal-tasks-title"
            >
              <h3 id="chat-modal-tasks-title" className="chat-modal-tasks-title">
                {challengeTitle ? `${challengeTitle} — tasks` : "Tasks"}
              </h3>
              <ul className="chat-modal-task-list">
                {tasks.map((task) => {
                  const isCompleted = completedTaskIds.has(task.id);
                  return (
                    <li key={task.id} className="chat-modal-task-item">
                      <label className="chat-modal-task-label">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          disabled
                          readOnly
                          aria-checked={isCompleted}
                        />
                        <span
                          className={
                            isCompleted
                              ? "chat-modal-task-text chat-modal-task-text--done"
                              : "chat-modal-task-text"
                          }
                        >
                          {task.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="chat-modal-messages" aria-live="polite">
            {isLoadingHistory ? (
              <p className="chat-modal-empty-state">Loading conversation...</p>
            ) : messages.length === 0 ? (
              <p className="chat-modal-empty-state">
                Start a conversation with {character.name}.
              </p>
            ) : (
              <ul className="chat-message-list">
                {messages.map((chatMessage, index) => {
                  const stageDirection =
                    chatMessage.role === "assistant"
                      ? getStageDirectionText(chatMessage.content)
                      : null;

                  if (stageDirection !== null) {
                    return (
                      <li
                        key={`${chatMessage.role}-${index}-${chatMessage.content}`}
                        className="chat-message-row chat-message-row--stage"
                      >
                        <p className="chat-message-stage">{stageDirection}</p>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={`${chatMessage.role}-${index}-${chatMessage.content}`}
                      className={
                        chatMessage.role === "user"
                          ? "chat-message-row chat-message-row--user"
                          : "chat-message-row chat-message-row--assistant"
                      }
                    >
                      <div
                        className={
                          chatMessage.role === "user"
                            ? "chat-message-shell chat-message-shell--user"
                            : "chat-message-shell"
                        }
                      >
                        {chatMessage.role === "user" &&
                          hasCorrectionThread(chatMessage) && (
                            <button
                              type="button"
                              className="chat-message-warning-button"
                              aria-label="Open grammar correction with Teacher Wang"
                              title="Grammar issue — ask Teacher Wang"
                              onClick={() =>
                                openCorrectionThread(index, chatMessage)
                              }
                            >
                              <WarningIcon className="chat-message-warning-icon" />
                            </button>
                          )}
                        <div
                          className={
                            chatMessage.role === "user"
                              ? "chat-message chat-message--user"
                              : "chat-message chat-message--assistant"
                          }
                        >
                          {chatMessage.content}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {isSending && (
              <p className="chat-modal-typing-indicator">
                {character.name} is typing...
              </p>
            )}
          </div>

          {error && <p className="chat-modal-error table-error">{error}</p>}

          <form
            className="chat-modal-composer"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label
              className="chat-modal-composer-label"
              htmlFor={`chat-message-input-${character.id}-${stacked ? "stacked" : "main"}`}
            >
              Message
            </label>
            <div className="chat-modal-composer-row">
              <input
                id={`chat-message-input-${character.id}-${stacked ? "stacked" : "main"}`}
                type="text"
                value={message}
                placeholder="Type your message..."
                disabled={isSending || isClearing}
                onChange={(event) => setMessage(event.target.value)}
              />
              <button
                type="submit"
                className="page-add-button"
                disabled={isSending || isClearing || message.trim() === ""}
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {allowClearHistory && (
        <ConfirmModal
          isOpen={isClearConfirmOpen}
          message={`Clear all chat history with ${character.name}? This cannot be undone.`}
          onConfirm={() => void handleClearHistory()}
          onCancel={() => setIsClearConfirmOpen(false)}
        />
      )}

      {activeCorrection !== null && (
        <ChatModal
          key={activeCorrection.threadId}
          character={TEACHER_WANG}
          onClose={() => setActiveCorrection(null)}
          initialMessages={activeCorrection.messages}
          loadHistory={false}
          stacked
          allowClearHistory={false}
          thread={{
            parentCharacterId: character.id,
            threadId: activeCorrection.threadId,
          }}
          onThreadMessagesChange={(threadMessages) => {
            setActiveCorrection((current) =>
              current
                ? {
                    ...current,
                    messages: threadMessages,
                  }
                : current,
            );
            setMessages((current) =>
              current.map((entry, index) =>
                index === activeCorrection.messageIndex
                  ? {
                      ...entry,
                      correctionThread: threadMessages,
                      correctionAnswer:
                        threadMessages.find(
                          (threadMessage) => threadMessage.role === "assistant",
                        )?.content ?? entry.correctionAnswer,
                    }
                  : entry,
              ),
            );
          }}
        />
      )}
    </>
  );
}
