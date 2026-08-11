import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatCharacter } from "./ChatCharacterCard";
import ChatCharacterAvatar from "./ChatCharacterAvatar";
import ChallengeConfetti from "./ChallengeConfetti";
import ConfirmModal from "./ConfirmModal";
import {
  CheckIcon,
  CloseIcon,
  IncorrectIcon,
  QuestionIcon,
  TrashIcon,
  TrophyIcon,
  WarningIcon,
} from "./icons";
import { TEACHER_WANG } from "../data/chatCharacters";
import type { ChallengeTask } from "../types/challenge";
import type {
  ChatMessage,
  ChatThreadContext,
  GrammarSeverity,
} from "../types/chat";
import {
  clearChatHistory,
  fetchChatHistory,
  sendChatMessage,
} from "../utils/aiChat/chatApi";
import { parseMessageSegments } from "../utils/aiChat/stageDirection";
import chatCharacterCardStyles from "./ChatCharacterCard.module.css";
import styles from "./ChatModal.module.css";

type CorrectionThreadState = {
  messageIndex: number;
  threadId: string;
  messages: ChatMessage[];
  severity: GrammarSeverity;
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
  grammarSeverity?: GrammarSeverity;
};

const GRAMMAR_SEVERITY_LABELS: Record<GrammarSeverity, string> = {
  none: "Correct",
  minor: "Minor mistake",
  awkward: "Awkward wording",
  incorrect: "Incorrect",
};

function resolveCorrectionSeverity(
  message: ChatMessage,
): GrammarSeverity | null {
  if (message.correctionSeverity) {
    return message.correctionSeverity;
  }

  if (hasCorrectionThread(message)) {
    return "incorrect";
  }

  return null;
}

function hasCorrectionThread(message: ChatMessage): boolean {
  return Boolean(
    message.correctionThreadId ||
      (message.correctionThread && message.correctionThread.length > 0) ||
      message.correctionAnswer,
  );
}

const MARKDOWN_INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
const MARKDOWN_HEADER_PATTERN = /^(#{1,6})\s+(.*)$/;

function renderInlineFormattedText(text: string, keyPrefix: string) {
  return text.split(MARKDOWN_INLINE_PATTERN).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function renderFormattedText(text: string) {
  const lines = text.split("\n");
  if (lines.length === 1 && !MARKDOWN_HEADER_PATTERN.test(text)) {
    return renderInlineFormattedText(text, "0");
  }
  return lines.map((line, lineIndex) => {
    const headerMatch = line.match(MARKDOWN_HEADER_PATTERN);
    if (headerMatch) {
      const level = Math.min(headerMatch[1].length, 6);
      const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <HeadingTag key={lineIndex} className={styles.chatMessageHeading}>
          {renderInlineFormattedText(headerMatch[2], String(lineIndex))}
        </HeadingTag>
      );
    }
    return (
      <span key={lineIndex}>
        {renderInlineFormattedText(line, String(lineIndex))}
        {lineIndex < lines.length - 1 ? "\n" : null}
      </span>
    );
  });
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
  grammarSeverity,
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
  const [showConfetti, setShowConfetti] = useState(false);
  const wasChallengeCompleteRef = useRef(false);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const isChallengeComplete = Boolean(
    tasks &&
      tasks.length > 0 &&
      tasks.every((task) => completedTaskIds.has(task.id)),
  );

  useEffect(() => {
    if (isChallengeComplete && !wasChallengeCompleteRef.current) {
      wasChallengeCompleteRef.current = true;
      setShowConfetti(true);
      const timeoutId = window.setTimeout(() => {
        setShowConfetti(false);
      }, 2000);
      return () => window.clearTimeout(timeoutId);
    }

    if (!isChallengeComplete) {
      wasChallengeCompleteRef.current = false;
      setShowConfetti(false);
    }
  }, [isChallengeComplete]);

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
    setShowConfetti(false);
    wasChallengeCompleteRef.current = false;

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

  const activeCharacter = character;

  function focusMessageInput() {
    messageInputRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (
      trimmedMessage === "" ||
      isSending ||
      isClearing ||
      isChallengeComplete
    ) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: trimmedMessage };
    const nextMessages: ChatMessage[] = [...messages, userMessage];

    setMessages(nextMessages);
    setMessage("");
    setError(null);
    setIsSending(true);
    focusMessageInput();

    try {
      const response = await sendChatMessage(
        activeCharacter.id,
        nextMessages,
        thread,
      );
      const updatedMessages = (() => {
        if (thread) {
          return [...nextMessages, response.message];
        }

        const correction = response.correction;
        const withCorrection =
          correction != null
            ? nextMessages.map((entry, index) => {
                if (index !== nextMessages.length - 1 || entry.role !== "user") {
                  return entry;
                }

                const severity = correction.severity;
                const updated: ChatMessage = {
                  ...entry,
                  correctionSeverity: severity,
                };

                if (
                  severity !== "none" &&
                  correction.answer &&
                  (correction.thread_id || correction.thread_messages)
                ) {
                  updated.correctionAnswer = correction.answer;
                  updated.correctionThreadId = correction.thread_id;
                  updated.correctionThread = correction.thread_messages ?? [
                    {
                      role: "assistant" as const,
                      content: correction.answer,
                    },
                  ];
                }

                return updated;
              })
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
      focusMessageInput();
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
      await clearChatHistory(activeCharacter.id);
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
    const severity = resolveCorrectionSeverity(chatMessage);
    if (severity === null || severity === "none") {
      return;
    }

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
      severity,
    });
  }

  function renderGrammarSeverityBadge(
    messageIndex: number,
    chatMessage: ChatMessage,
  ) {
    const severity = resolveCorrectionSeverity(chatMessage);
    if (severity === null) {
      return null;
    }

    const iconClassName = styles.chatMessageSeverityIcon;
    const label = GRAMMAR_SEVERITY_LABELS[severity];

    if (severity === "none") {
      return (
        <span
          className={`${styles.chatMessageSeverityBadge} ${styles.chatMessageSeverityBadgeNone}`}
          aria-label={label}
          title={label}
        >
          <CheckIcon className={iconClassName} />
        </span>
      );
    }

    const Icon =
      severity === "minor"
        ? WarningIcon
        : severity === "awkward"
          ? QuestionIcon
          : IncorrectIcon;

    return (
      <button
        type="button"
        className={`${styles.chatMessageSeverityBadge} ${styles[`chat-message-severity-badge--${severity}`]}`}
        aria-label={`Open grammar note (${label}) with Teacher Wang`}
        title={`${label} — ask Teacher Wang`}
        onClick={() => openCorrectionThread(messageIndex, chatMessage)}
      >
        <Icon className={iconClassName} />
      </button>
    );
  }

  const titleSeverityLabel =
    grammarSeverity && grammarSeverity !== "none"
      ? GRAMMAR_SEVERITY_LABELS[grammarSeverity]
      : null;

  return (
    <>
      <ChallengeConfetti active={showConfetti} />
      <div
        className={
          stacked ? "modal-overlay modal-overlay--stacked" : "modal-overlay"
        }
        onClick={onClose}
      >
        <div
          className={styles.chatModalDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.chatModalHeader}>
            <div className={styles.chatModalParticipant}>
              <ChatCharacterAvatar
                variant={character.avatarVariant}
                className={chatCharacterCardStyles.chatCharacterAvatarImageCompact}
              />
              <div className={styles.chatModalParticipantText}>
                <h2 id="chat-modal-title" className={styles.chatModalParticipantName}>
                  {character.name}{" "}
                  <span className={styles.chatModalParticipantChineseName}>
                    ({character.chineseName})
                  </span>
                  {titleSeverityLabel && (
                    <span className={styles.chatModalParticipantSeverity}>
                      {" "}
                      — {titleSeverityLabel}
                    </span>
                  )}
                </h2>
              </div>
            </div>
            <div className={styles.chatModalHeaderActions}>
              {allowClearHistory && (
                <button
                  type="button"
                  className={styles.chatModalClearButton}
                  disabled={
                    isLoadingHistory ||
                    isSending ||
                    isClearing ||
                    messages.length === 0
                  }
                  onClick={() => setIsClearConfirmOpen(true)}
                >
                  <TrashIcon className={styles.chatModalClearIcon} />
                  <span>
                    {isClearing ? "Clearing..." : "Clear chat history"}
                  </span>
                </button>
              )}
              <button
                type="button"
                className={styles.chatModalCloseButton}
                aria-label="Close chat"
                onClick={onClose}
              >
                <CloseIcon className={styles.chatModalCloseIcon} />
              </button>
            </div>
          </header>

          {tasks && tasks.length > 0 && (
            <section
              className={styles.chatModalTasks}
              aria-labelledby="chat-modal-tasks-title"
            >
              <h3 id="chat-modal-tasks-title" className={styles.chatModalTasksTitle}>
                {challengeTitle ? `${challengeTitle} — tasks` : "Tasks"}
              </h3>
              <ul className={styles.chatModalTaskList}>
                {tasks.map((task) => {
                  const isCompleted = completedTaskIds.has(task.id);
                  return (
                    <li key={task.id} className={styles.chatModalTaskItem}>
                      <label className={styles.chatModalTaskLabel}>
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
                              ? `chat-modal-task-text ${styles.chatModalTaskTextDone}`
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

          <div className={styles.chatModalMessages} aria-live="polite">
            {isLoadingHistory ? (
              <p className={styles.chatModalEmptyState}>Loading conversation...</p>
            ) : messages.length === 0 ? (
              <p className={styles.chatModalEmptyState}>
                Start a conversation with {character.name}.
              </p>
            ) : (
              <ul className={styles.chatMessageList}>
                {messages.map((chatMessage, index) => {
                  if (chatMessage.role === "assistant") {
                    const segments = parseMessageSegments(chatMessage.content);
                    const hasStage = segments.some(
                      (segment) => segment.type === "stage",
                    );

                    if (hasStage) {
                      return (
                        <li
                          key={`${chatMessage.role}-${index}-${chatMessage.content}`}
                          className={`${styles.chatMessageRow} ${styles.chatMessageRowAssistant} ${styles.chatMessageRowSegmented}`}
                        >
                          <div className={styles.chatMessageSegments}>
                            {segments.map((segment, segmentIndex) =>
                              segment.type === "stage" ? (
                                <p
                                  key={`${segmentIndex}-${segment.text}`}
                                  className={styles.chatMessageStage}
                                >
                                  {segment.text}
                                </p>
                              ) : (
                                <div
                                  key={`${segmentIndex}-${segment.text}`}
                                  className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}
                                >
                                  {renderFormattedText(segment.text)}
                                </div>
                              ),
                            )}
                          </div>
                        </li>
                      );
                    }
                  }

                  return (
                    <li
                      key={`${chatMessage.role}-${index}-${chatMessage.content}`}
                      className={
                        chatMessage.role === "user"
                          ? `${styles.chatMessageRow} ${styles.chatMessageRowUser}`
                          : `${styles.chatMessageRow} ${styles.chatMessageRowAssistant}`
                      }
                    >
                      <div
                        className={
                          chatMessage.role === "user"
                            ? `${styles.chatMessageShell} chat-message-shell--user`
                            : styles.chatMessageShell
                        }
                      >
                        {chatMessage.role === "user" &&
                          renderGrammarSeverityBadge(index, chatMessage)}
                        <div
                          className={
                            chatMessage.role === "user"
                              ? `${styles.chatMessage} ${styles.chatMessageUser}`
                              : `${styles.chatMessage} ${styles.chatMessageAssistant}`
                          }
                        >
                          {renderFormattedText(chatMessage.content)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {isSending && (
              <p className={styles.chatModalTypingIndicator}>
                {character.name} is typing...
              </p>
            )}
          </div>

          {error && (
            <p className={`${styles.chatModalError} table-error`}>{error}</p>
          )}

          {isChallengeComplete ? (
            <div
              className={styles.chatModalChallengeComplete}
              role="status"
              aria-live="polite"
            >
              <TrophyIcon className={styles.chatModalChallengeCompleteIcon} />
              <span>Challenge completed!</span>
            </div>
          ) : (
            <form
              className={styles.chatModalComposer}
              onSubmit={(event) => void handleSubmit(event)}
            >
              <label
                className={styles.chatModalComposerLabel}
                htmlFor={`chat-message-input-${character.id}-${stacked ? "stacked" : "main"}`}
              >
                Message
              </label>
              <div className={styles.chatModalComposerRow}>
                <input
                  ref={messageInputRef}
                  id={`chat-message-input-${character.id}-${stacked ? "stacked" : "main"}`}
                  type="text"
                  value={message}
                  placeholder="Type your message..."
                  disabled={isClearing}
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
          )}
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
          grammarSeverity={activeCorrection.severity}
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
