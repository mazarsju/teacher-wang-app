import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ChatCharacter } from "./ChatCharacterCard";
import ChatCharacterAvatar from "./ChatCharacterAvatar";
import Button from "./Button";
import ChallengeConfetti from "./ChallengeConfetti";
import ChallengeVocabularyModal from "./ChallengeVocabularyModal";
import ConfirmModal from "./ConfirmModal";
import GrammarMasteryModal from "./GrammarMasteryModal";
import {
  CheckIcon,
  CloseIcon,
  EyeIcon,
  IncorrectIcon,
  MicrophoneIcon,
  MoreIcon,
  QuestionIcon,
  SpeakerIcon,
  TrashIcon,
  TrophyIcon,
  WarningIcon,
} from "./icons";
import { getTeacherWang } from "../data/chatCharacters";
import { useVoiceInput } from "../hooks/useVoiceInput";
import type { ChallengeTask, ChallengeVocabularyWord } from "../types/challenge";
import type {
  ChatMessage,
  ChatThreadContext,
  GrammarSeverity,
} from "../types/chat";
import type { ChatListeningMode } from "../types/chatSetupPreference";
import {
  clearChatHistory,
  fetchChatHistory,
  fetchChatTts,
  sendChatMessage,
  transcribeChatAudio,
} from "../utils/aiChat/chatApi";
import {
  fetchChatSetupPreference,
  updateChatSetupPreference,
} from "../utils/aiChat/chatSetupPreferenceApi";
import { trimMessagesForContext } from "../utils/aiChat/chatContextWindow";
import { isChineseOnlyText } from "../utils/aiChat/chineseText";
import { parseMessageSegments } from "../utils/aiChat/stageDirection";
import { renderFormattedText } from "../utils/formatMarkdownText";
import { checkGrammarPoint } from "../utils/grammar/grammarPointsApi";
import { useAppDispatch } from "../store/hooks";
import { applyGrammarPointUsageUpdates } from "../store/slices/grammarSlice";
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
  vocabulary?: ChallengeVocabularyWord[];
  challengeTitle?: string;
  grammarSeverity?: GrammarSeverity;
  /** Skip server-side persistence for this conversation entirely (no history, no thread). */
  ephemeral?: boolean;
  /** Immediately send the last (user-role) message of `initialMessages` on open, instead of waiting for the learner to type. Requires `loadHistory={false}`. */
  autoSendInitialMessage?: boolean;
  /** Folded into the system prompt server-side (ephemeral chat only) so the agent stays scoped to this topic. */
  topicContext?: string;
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

/**
 * The part of an assistant message that's actually spoken: the whole
 * content, or just the dialogue segments when stage directions (``[[...]]``)
 * are mixed in — those are narration, not something Teacher Wang says aloud.
 */
function getSpokenText(message: ChatMessage): string {
  const segments = parseMessageSegments(message.content);
  if (!segments.some((segment) => segment.type === "stage")) {
    return message.content;
  }

  return segments
    .filter((segment) => segment.type === "text")
    .map((segment) => segment.text)
    .join("");
}

function isTtsEligibleMessage(message: ChatMessage): boolean {
  return message.role === "assistant" && isChineseOnlyText(getSpokenText(message));
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
  vocabulary,
  challengeTitle,
  grammarSeverity,
  ephemeral = false,
  autoSendInitialMessage = false,
  topicContext,
}: ChatModalProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation("common");
  const { t: tChat } = useTranslation("chat");
  const grammarSeverityLabels: Record<GrammarSeverity, string> = {
    none: t("chatModal.severity.correct"),
    minor: t("chatModal.severity.minorMistake"),
    awkward: t("chatModal.severity.awkwardWording"),
    incorrect: t("chatModal.severity.incorrect"),
  };
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
  const [isVocabularyOpen, setIsVocabularyOpen] = useState(false);
  const [masteredGrammarPoints, setMasteredGrammarPoints] = useState<
    string[] | null
  >(null);
  const [showMasteryConfetti, setShowMasteryConfetti] = useState(false);
  const [loadingAudioIndices, setLoadingAudioIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [listeningMode, setListeningMode] =
    useState<ChatListeningMode>("reading_first");
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const wasChallengeCompleteRef = useRef(false);
  const autoSentRef = useRef(false);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<Record<number, string>>({});
  const loadingAudioIndicesRef = useRef<Set<number>>(new Set());

  const isChallengeComplete = Boolean(
    tasks &&
      tasks.length > 0 &&
      tasks.every((task) => completedTaskIds.has(task.id)),
  );
  const completedTaskCount =
    tasks?.filter((task) => completedTaskIds.has(task.id)).length ?? 0;

  useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    fetchChatSetupPreference()
      .then((preference) => setListeningMode(preference.listening_mode))
      .catch(() => {
        // Best-effort; falls back to the reading-first default.
      });
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

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
    if (masteredGrammarPoints === null) {
      setShowMasteryConfetti(false);
      return;
    }

    setShowMasteryConfetti(true);
    const timeoutId = window.setTimeout(() => {
      setShowMasteryConfetti(false);
    }, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [masteredGrammarPoints]);

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
    setIsVocabularyOpen(false);
    setMasteredGrammarPoints(null);
    Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    audioUrlsRef.current = {};
    loadingAudioIndicesRef.current = new Set();
    setLoadingAudioIndices(new Set());
    setRevealedIndices(new Set());
    wasChallengeCompleteRef.current = false;
    autoSentRef.current = false;

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
              : t("chatModal.errors.loadHistory"),
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
    // character is keyed by id: getTeacherWang()/getXiaoMing() return a new
    // object every render, which would otherwise re-fire this reset effect
    // (and re-arm the auto-send guard below) on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id, loadHistory, thread?.threadId]);

  useEffect(() => {
    if (character === null || loadHistory || !autoSendInitialMessage) {
      return;
    }
    if (autoSentRef.current) {
      return;
    }

    const seeded = initialMessages ?? [];
    const lastMessage = seeded[seeded.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return;
    }

    autoSentRef.current = true;
    void sendTurn(seeded, seeded.slice(0, -1));
    // initialMessages is only read for the seed at mount/open, same as above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id, loadHistory, autoSendInitialMessage, thread?.threadId]);

  const {
    phase: voicePhase,
    error: voiceError,
    pressHandlers: voicePressHandlers,
  } = useVoiceInput(
    transcribeChatAudio,
    (text) => setMessage((current) => current + text),
    focusMessageInput,
  );

  useEffect(() => {
    if (voiceError) {
      setError(voiceError);
    }
  }, [voiceError]);

  if (character === null) {
    return null;
  }

  const activeCharacter = character;

  function focusMessageInput() {
    messageInputRef.current?.focus();
  }

  /**
   * Fetches TTS audio for a message the first time it's needed (a fresh
   * reply, or a history bubble the learner clicks on), caching the result so
   * later clicks just replay it. `autoplay` forces playback once the audio
   * arrives (a manual click); otherwise it only plays when listening-first
   * mode wants it read out automatically.
   */
  function requestAudioForMessage(
    index: number,
    chatMessage: ChatMessage,
    { autoplay }: { autoplay: boolean },
  ) {
    if (!isTtsEligibleMessage(chatMessage)) {
      return;
    }

    const existingUrl = audioUrlsRef.current[index];
    if (existingUrl) {
      if (autoplay) {
        playAudio(existingUrl);
      }
      return;
    }

    if (loadingAudioIndicesRef.current.has(index)) {
      return;
    }

    loadingAudioIndicesRef.current = new Set(loadingAudioIndicesRef.current).add(
      index,
    );
    setLoadingAudioIndices(new Set(loadingAudioIndicesRef.current));

    fetchChatTts(getSpokenText(chatMessage), activeCharacter.voice)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        audioUrlsRef.current = { ...audioUrlsRef.current, [index]: url };
        if (autoplay || listeningMode === "listening_first") {
          playAudio(url);
        }
      })
      .catch(() => {
        // Best-effort; the button returns to its idle state so the learner can retry.
      })
      .finally(() => {
        const next = new Set(loadingAudioIndicesRef.current);
        next.delete(index);
        loadingAudioIndicesRef.current = next;
        setLoadingAudioIndices(new Set(next));
      });
  }

  function playAudio(url: string) {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }
    audioPlayerRef.current.src = url;
    void audioPlayerRef.current.play();
  }

  function revealMessage(index: number) {
    setRevealedIndices((current) => new Set(current).add(index));
  }

  function renderListenButton(
    index: number,
    chatMessage: ChatMessage,
    isAudioLoading: boolean,
  ) {
    return (
      <button
        key="listen"
        type="button"
        className={styles.chatMessageListenButton}
        aria-label={
          isAudioLoading ? t("chatModal.loadingAudio") : t("chatModal.playAudio")
        }
        title={
          isAudioLoading ? t("chatModal.loadingAudio") : t("chatModal.playAudio")
        }
        disabled={isAudioLoading}
        onClick={() => requestAudioForMessage(index, chatMessage, { autoplay: true })}
      >
        {isAudioLoading ? (
          <span className={styles.chatMessageListenSpinner} aria-hidden="true" />
        ) : (
          <SpeakerIcon className={styles.chatMessageListenIcon} />
        )}
      </button>
    );
  }

  async function sendTurn(
    nextMessages: ChatMessage[],
    previousMessages: ChatMessage[],
  ): Promise<boolean> {
    setMessages(nextMessages);
    setError(null);
    setIsSending(true);

    const historyMessages = nextMessages.filter((entry) => !entry.isDisplayOnly);
    const isChallenge = Boolean(tasks && tasks.length > 0);
    const messagesToSend =
      thread || isChallenge ? historyMessages : trimMessagesForContext(historyMessages);

    try {
      const response = await sendChatMessage(
        activeCharacter.id,
        messagesToSend,
        thread,
        ephemeral,
        topicContext,
      );
      const updatedMessages = (() => {
        if (thread) {
          return [...nextMessages, response.message];
        }

        const correction = response.correction;
        if (correction?.severity === "none") {
          const lastUserMessage = nextMessages[nextMessages.length - 1];
          if (lastUserMessage?.role === "user") {
            checkGrammarPoint(lastUserMessage.content)
              .then((result) => {
                if (result.updated_grammar_points.length > 0) {
                  dispatch(applyGrammarPointUsageUpdates(result.updated_grammar_points));
                }
                if (result.new_grammar_points_mastered.length > 0) {
                  setMasteredGrammarPoints(result.new_grammar_points_mastered);
                }
              })
              .catch(() => {
                // Best-effort; grammar mastery tracking is non-critical.
              });
          }
        }
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
      requestAudioForMessage(updatedMessages.length - 1, response.message, {
        autoplay: false,
      });
      onThreadMessagesChange?.(updatedMessages);
      if (response.completed_task_ids) {
        setCompletedTaskIds(new Set(response.completed_task_ids));
      }
      return true;
    } catch (sendError) {
      setMessages(previousMessages);
      setError(
        sendError instanceof Error
          ? sendError.message
          : t("chatModal.errors.sendMessage"),
      );
      return false;
    } finally {
      setIsSending(false);
    }
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
    const previousMessages = messages;

    setMessage("");
    focusMessageInput();

    const succeeded = await sendTurn(nextMessages, previousMessages);
    if (!succeeded) {
      setMessage(trimmedMessage);
    }
    focusMessageInput();
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
          : t("chatModal.errors.clearHistory"),
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function toggleListeningMode() {
    const previousMode = listeningMode;
    const nextMode: ChatListeningMode =
      previousMode === "listening_first" ? "reading_first" : "listening_first";
    setListeningMode(nextMode);

    try {
      await updateChatSetupPreference({ listening_mode: nextMode });
    } catch (updateError) {
      setListeningMode(previousMode);
      setError(
        updateError instanceof Error
          ? updateError.message
          : t("chatModal.errors.updateListeningMode"),
      );
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
      setError(t("chatModal.errors.correctionThreadUnavailable"));
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
    const label = grammarSeverityLabels[severity];

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
        aria-label={t("chatModal.openGrammarNoteAriaLabel", { severity: label })}
        title={t("chatModal.askTeacherWangTitle", { severity: label })}
        onClick={() => openCorrectionThread(messageIndex, chatMessage)}
      >
        <Icon className={iconClassName} />
      </button>
    );
  }

  const titleSeverityLabel =
    grammarSeverity && grammarSeverity !== "none"
      ? grammarSeverityLabels[grammarSeverity]
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
              {allowClearHistory ? (
                <div className={styles.chatModalMenu} ref={menuRef}>
                  <button
                    type="button"
                    className={styles.chatModalMenuTrigger}
                    aria-label={t("chatModal.moreOptions")}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    onClick={() => setIsMenuOpen((open) => !open)}
                  >
                    <MoreIcon className={styles.chatModalMenuTriggerIcon} />
                  </button>
                  {isMenuOpen && (
                    <div
                      className={styles.chatModalMenuDropdown}
                      role="menu"
                      aria-label={t("chatModal.moreOptions")}
                    >
                      <button
                        type="button"
                        className={styles.chatModalMenuItem}
                        role="menuitem"
                        disabled={
                          isLoadingHistory ||
                          isSending ||
                          isClearing ||
                          messages.length === 0
                        }
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsClearConfirmOpen(true);
                        }}
                      >
                        <TrashIcon className={styles.chatModalMenuItemIcon} />
                        <span>{t("chatModal.clearHistory")}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.chatModalMenuItem}
                        role="menuitem"
                        onClick={() => {
                          setIsMenuOpen(false);
                          void toggleListeningMode();
                        }}
                      >
                        {listeningMode === "listening_first" ? (
                          <EyeIcon className={styles.chatModalMenuItemIcon} />
                        ) : (
                          <SpeakerIcon className={styles.chatModalMenuItemIcon} />
                        )}
                        <span>
                          {listeningMode === "listening_first"
                            ? t("chatModal.switchToReadingFirst")
                            : t("chatModal.switchToListeningFirst")}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.chatModalMenuItem}
                        role="menuitem"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onClose();
                        }}
                      >
                        <CloseIcon className={styles.chatModalMenuItemIcon} />
                        <span>{t("chatModal.backToMenu")}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.chatModalCloseButton}
                  aria-label={t("chatModal.closeChat")}
                  onClick={onClose}
                >
                  <CloseIcon className={styles.chatModalCloseIcon} />
                </button>
              )}
            </div>
          </header>

          {tasks && tasks.length > 0 && (
            <section
              className={styles.chatModalTasks}
              aria-labelledby="chat-modal-tasks-title"
            >
              <div className={styles.chatModalTasksHeader}>
                <h3 id="chat-modal-tasks-title" className={styles.chatModalTasksTitle}>
                  {challengeTitle
                    ? t("chatModal.tasksTitleWithChallenge", { challengeTitle })
                    : t("chatModal.tasksTitle")}
                </h3>
                <span className={styles.chatModalTasksProgress}>
                  {t("chatModal.tasksProgress", {
                    completed: completedTaskCount,
                    total: tasks.length,
                  })}
                </span>
              </div>
              <ul className={styles.chatModalTaskList}>
                {tasks.map((task) => {
                  const isCompleted = completedTaskIds.has(task.id);
                  return (
                    <li key={task.id} className={styles.chatModalTaskItem}>
                      <label className={styles.chatModalTaskLabel}>
                        <input
                          type="checkbox"
                          className={styles.chatModalTaskCheckbox}
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
              {vocabulary && vocabulary.length > 0 && (
                <div className={styles.chatModalTasksFooter}>
                  <button
                    type="button"
                    className={styles.chatModalHelpButton}
                    onClick={() => setIsVocabularyOpen(true)}
                  >
                    <QuestionIcon className={styles.chatModalHelpIcon} />
                    <span>{t("chatModal.vocabularyHelpButton")}</span>
                  </button>
                </div>
              )}
            </section>
          )}

          <div className={styles.chatModalMessages} aria-live="polite">
            {isLoadingHistory ? (
              <p className={styles.chatModalEmptyState}>
                {t("chatModal.loadingConversation")}
              </p>
            ) : messages.length === 0 ? (
              <p className={styles.chatModalEmptyState}>
                {t("chatModal.emptyState", { name: character.name })}
              </p>
            ) : (
              <ul className={styles.chatMessageList}>
                {messages.map((chatMessage, index) => {
                  if (chatMessage.isContext) {
                    return (
                      <li
                        key={`${chatMessage.role}-${index}-${chatMessage.content}`}
                        className={`${styles.chatMessageRow} ${styles.chatMessageRowSegmented}`}
                      >
                        <div className={styles.chatMessageSegments}>
                          <div className={styles.chatMessageStage}>
                            {renderFormattedText(
                              chatMessage.displayContent ?? chatMessage.content,
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  }

                  if (chatMessage.role === "assistant") {
                    const segments = parseMessageSegments(chatMessage.content);
                    const hasStage = segments.some(
                      (segment) => segment.type === "stage",
                    );

                    if (hasStage) {
                      const isTtsEligible = isTtsEligibleMessage(chatMessage);
                      const isMasked =
                        listeningMode === "listening_first" &&
                        isTtsEligible &&
                        !revealedIndices.has(index);
                      const isAudioLoading = loadingAudioIndices.has(index);

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
                                  className={styles.chatMessageShell}
                                >
                                  <ChatCharacterAvatar
                                    variant={character.avatarVariant}
                                    className={styles.chatMessageAvatar}
                                  />
                                  <div
                                    className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}
                                  >
                                    {isMasked ? (
                                      <div className={styles.chatMessageMaskedWrap}>
                                        <div
                                          className={styles.chatMessageMaskedText}
                                          aria-hidden="true"
                                        >
                                          {renderFormattedText(
                                            segment.text,
                                            styles.chatMessageHeading,
                                          )}
                                        </div>
                                        {renderListenButton(
                                          index,
                                          chatMessage,
                                          isAudioLoading,
                                        )}
                                        <button
                                          type="button"
                                          className={styles.chatMessageRevealButton}
                                          aria-label={t("chatModal.revealText")}
                                          title={t("chatModal.revealText")}
                                          onClick={() => revealMessage(index)}
                                        >
                                          <EyeIcon
                                            className={styles.chatMessageRevealIcon}
                                          />
                                        </button>
                                      </div>
                                    ) : isTtsEligible ? (
                                      <div className={styles.chatMessageTextWithListen}>
                                        {renderFormattedText(
                                          segment.text,
                                          styles.chatMessageHeading,
                                        )}
                                        {renderListenButton(
                                          index,
                                          chatMessage,
                                          isAudioLoading,
                                        )}
                                      </div>
                                    ) : (
                                      renderFormattedText(
                                        segment.text,
                                        styles.chatMessageHeading,
                                      )
                                    )}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </li>
                      );
                    }
                  }

                  const isTtsEligible = isTtsEligibleMessage(chatMessage);
                  const isMasked =
                    listeningMode === "listening_first" &&
                    isTtsEligible &&
                    !revealedIndices.has(index);
                  const isAudioLoading = loadingAudioIndices.has(index);

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
                        {chatMessage.role === "assistant" && (
                          <ChatCharacterAvatar
                            variant={character.avatarVariant}
                            className={styles.chatMessageAvatar}
                          />
                        )}
                        <div
                          className={
                            chatMessage.role === "user"
                              ? `${styles.chatMessage} ${styles.chatMessageUser}`
                              : `${styles.chatMessage} ${styles.chatMessageAssistant}`
                          }
                        >
                          {isMasked ? (
                            <div className={styles.chatMessageMaskedWrap}>
                              <div
                                className={styles.chatMessageMaskedText}
                                aria-hidden="true"
                              >
                                {renderFormattedText(
                                  chatMessage.content,
                                  styles.chatMessageHeading,
                                )}
                              </div>
                              {renderListenButton(index, chatMessage, isAudioLoading)}
                              <button
                                type="button"
                                className={styles.chatMessageRevealButton}
                                aria-label={t("chatModal.revealText")}
                                title={t("chatModal.revealText")}
                                onClick={() => revealMessage(index)}
                              >
                                <EyeIcon className={styles.chatMessageRevealIcon} />
                              </button>
                            </div>
                          ) : isTtsEligible ? (
                            <div className={styles.chatMessageTextWithListen}>
                              {renderFormattedText(
                                chatMessage.content,
                                styles.chatMessageHeading,
                              )}
                              {renderListenButton(index, chatMessage, isAudioLoading)}
                            </div>
                          ) : (
                            renderFormattedText(
                              chatMessage.content,
                              styles.chatMessageHeading,
                            )
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {isSending && (
              <p className={styles.chatModalTypingIndicator}>
                {t("chatModal.typingIndicator", { name: character.name })}
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
              <span>{t("chatModal.challengeCompleted")}</span>
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
                {t("chatModal.messageLabel")}
              </label>
              <div className={styles.chatModalComposerRow}>
                <input
                  ref={messageInputRef}
                  id={`chat-message-input-${character.id}-${stacked ? "stacked" : "main"}`}
                  type="text"
                  value={message}
                  placeholder={
                    voicePhase === "processing"
                      ? t("chatModal.transcribing")
                      : t("chatModal.messagePlaceholder")
                  }
                  disabled={isClearing || voicePhase === "processing"}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <button
                  type="button"
                  className={`${styles.chatModalRecordButton} ${
                    voicePhase === "recording"
                      ? styles.chatModalRecordButtonActive
                      : voicePhase === "processing"
                        ? styles.chatModalRecordButtonProcessing
                        : ""
                  }`}
                  aria-label={
                    voicePhase === "recording"
                      ? t("chatModal.recording")
                      : voicePhase === "processing"
                        ? t("chatModal.transcribing")
                        : t("chatModal.recordVoice")
                  }
                  title={
                    voicePhase === "recording"
                      ? t("chatModal.recording")
                      : voicePhase === "processing"
                        ? t("chatModal.transcribing")
                        : t("chatModal.recordVoice")
                  }
                  disabled={isSending || isClearing || voicePhase === "processing"}
                  {...voicePressHandlers}
                >
                  <MicrophoneIcon className={styles.chatModalRecordIcon} />
                </button>
                <Button
                  kind="confirm"
                  htmlType="submit"
                  text={isSending ? t("chatModal.sending") : t("chatModal.send")}
                  disabled={
                    isSending ||
                    isClearing ||
                    voicePhase === "processing" ||
                    message.trim() === ""
                  }
                />
              </div>
            </form>
          )}
        </div>
      </div>

      {allowClearHistory && (
        <ConfirmModal
          isOpen={isClearConfirmOpen}
          message={t("chatModal.clearHistoryConfirm", { name: character.name })}
          onConfirm={() => void handleClearHistory()}
          onCancel={() => setIsClearConfirmOpen(false)}
        />
      )}

      {activeCorrection !== null && (
        <ChatModal
          key={activeCorrection.threadId}
          character={getTeacherWang(tChat)}
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

      {vocabulary && vocabulary.length > 0 && (
        <ChallengeVocabularyModal
          isOpen={isVocabularyOpen}
          challengeTitle={challengeTitle ?? character.name}
          vocabulary={vocabulary}
          onClose={() => setIsVocabularyOpen(false)}
        />
      )}

      {masteredGrammarPoints !== null && (
        <>
          <ChallengeConfetti active={showMasteryConfetti} />
          <GrammarMasteryModal
            grammarPointTitles={masteredGrammarPoints}
            onClose={() => setMasteredGrammarPoints(null)}
          />
        </>
      )}
    </>
  );
}
