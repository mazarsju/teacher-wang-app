import { useEffect, useState } from "react";
import Button from "../components/Button";
import ChatModal from "../components/ChatModal";
import ConfirmModal from "../components/ConfirmModal";
import GrammarExercises, { scoreBand } from "../components/GrammarExercises";
import GrammarVocabularyTab from "../components/GrammarVocabularyTab";
import Page from "../components/Page";
import { TEACHER_WANG } from "../data/chatCharacters";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  setGrammarPointScore,
  setGrammarPointStatus,
  setGrammarQuizInProgress,
} from "../store/slices/grammarSlice";
import type { GrammarPointDetail } from "../types/grammarPoint";
import { renderFormattedText } from "../utils/formatMarkdownText";
import {
  completeGrammarPoint,
  fetchGrammarPointDetail,
  skipGrammarPoint,
} from "../utils/grammar/grammarPointsApi";
import styles from "./GrammarPointDetailPage.module.css";

type GrammarDetailTab = "explanation" | "exercises" | "vocabulary";

const LESSON_CHAT_GREETING =
  "Ask me what you did not understand on this lesson, will be happy to help!";

function buildLessonTopicContext(detail: GrammarPointDetail): string {
  return detail.explanation
    ? `# ${detail.title}\n\n${detail.explanation}`
    : `# ${detail.title}`;
}

type GrammarPointDetailPageProps = {
  grammarId: string;
  onBack: () => void;
};

export default function GrammarPointDetailPage({
  grammarId,
  onBack,
}: GrammarPointDetailPageProps) {
  const dispatch = useAppDispatch();
  const quizInProgress = useAppSelector((state) => state.grammar.quizInProgress);
  const currentHskLevel = useAppSelector(
    (state) => state.hsk.status?.current_level ?? 0,
  );
  const [detail, setDetail] = useState<GrammarPointDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GrammarDetailTab>("explanation");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLessonChatOpen, setIsLessonChatOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchGrammarPointDetail(grammarId)
      .then((fetchedDetail) => {
        if (!cancelled) {
          setDetail(fetchedDetail);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load grammar topic.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [grammarId]);

  function handleBackClick() {
    if (quizInProgress) {
      setShowLeaveConfirm(true);
      return;
    }
    onBack();
  }

  function handleFinishQuiz(percentage: number) {
    const status = scoreBand(percentage) === "good" ? "DONE" : "WIP";
    dispatch(setGrammarPointScore({ id: grammarId, status, score: percentage }));
    completeGrammarPoint(grammarId, percentage).catch(() => {
      setSaveError("Failed to save the quiz result.");
    });
  }

  async function handleSkip() {
    try {
      await skipGrammarPoint(grammarId);
      dispatch(setGrammarPointStatus({ id: grammarId, status: "SKIP" }));
      setDetail((previous) => (previous ? { ...previous, status: "SKIP" } : previous));
    } catch (skipError) {
      setSaveError(
        skipError instanceof Error
          ? skipError.message
          : "Failed to mark this lesson as known.",
      );
    }
  }

  const canSkip = detail?.status === "TODO" && detail.hsk_level <= currentHskLevel;

  return (
    <Page
      title={detail?.title ?? "Grammar topic"}
      headerAction={
        <Button kind="cancel" variant="page" text="Back" onClick={handleBackClick} />
      }
    >
      <ConfirmModal
        isOpen={showLeaveConfirm}
        message="You've started this questionnaire. Leaving now means you'll need to start it over from the first question. Leave anyway?"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          onBack();
        }}
        onCancel={() => setShowLeaveConfirm(false)}
      />
      {isLoading && <p>Loading grammar topic...</p>}
      {error && <p className="table-error">{error}</p>}
      {saveError && <p className="table-error">{saveError}</p>}
      {!isLoading && !error && detail && (
        <>
          <div className={styles.grammarDetailTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "explanation"}
              className={
                activeTab === "explanation"
                  ? `${styles.grammarDetailTab} ${styles.grammarDetailTabActive}`
                  : styles.grammarDetailTab
              }
              onClick={() => setActiveTab("explanation")}
            >
              Explanation
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "exercises"}
              className={
                activeTab === "exercises"
                  ? `${styles.grammarDetailTab} ${styles.grammarDetailTabActive}`
                  : styles.grammarDetailTab
              }
              onClick={() => setActiveTab("exercises")}
            >
              Exercises
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "vocabulary"}
              className={
                activeTab === "vocabulary"
                  ? `${styles.grammarDetailTab} ${styles.grammarDetailTabActive}`
                  : styles.grammarDetailTab
              }
              onClick={() => setActiveTab("vocabulary")}
            >
              Vocabulary
            </button>
          </div>
          <div
            className={
              activeTab === "explanation"
                ? styles.grammarDetailExplanation
                : styles.grammarDetailHidden
            }
          >
            {detail.explanation
              ? renderFormattedText(detail.explanation.replace(/\n{2,}/g, "\n"))
              : "No explanation available yet."}
            {canSkip && (
              <div className={styles.grammarDetailSkip}>
                <p className={styles.grammarDetailSkipHint}>
                  Already know this lesson? You can skip it and its exercises.
                </p>
                <Button
                  kind="confirm"
                  variant="page"
                  text="Skip this lesson"
                  onClick={handleSkip}
                />
              </div>
            )}
            <Button
              kind="cancel"
              variant="page"
              text="Ask more information to Teacher Wang"
              onClick={() => setIsLessonChatOpen(true)}
            />
          </div>
          <div className={activeTab === "exercises" ? undefined : styles.grammarDetailHidden}>
            <GrammarExercises
              exercises={detail.exercises ?? []}
              grammarPointTitle={detail.title}
              onFinish={handleFinishQuiz}
              onProgressChange={(inProgress) =>
                dispatch(setGrammarQuizInProgress(inProgress))
              }
            />
          </div>
          <div className={activeTab === "vocabulary" ? undefined : styles.grammarDetailHidden}>
            <GrammarVocabularyTab words={detail.new_words} />
          </div>
          {isLessonChatOpen && (
            <ChatModal
              character={TEACHER_WANG}
              onClose={() => setIsLessonChatOpen(false)}
              initialMessages={[
                {
                  role: "assistant",
                  content: LESSON_CHAT_GREETING,
                  isDisplayOnly: true,
                },
              ]}
              loadHistory={false}
              allowClearHistory={false}
              ephemeral
              topicContext={buildLessonTopicContext(detail)}
            />
          )}
        </>
      )}
    </Page>
  );
}
