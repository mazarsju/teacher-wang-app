import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import ChatModal from "./ChatModal";
import { PenIcon } from "./icons";
import SentenceCorrectionModal from "./SentenceCorrectionModal";
import VoiceInputButton from "./VoiceInputButton";
import WarningModal from "./WarningModal";
import WritingReviewModal from "./WritingReviewModal";
import { getTeacherWang } from "../data/chatCharacters";
import { useAppDispatch } from "../store/hooks";
import { applyGrammarPointUsageUpdates } from "../store/slices/grammarSlice";
import type { WritingSentenceCheck } from "../types/writingSentence";
import { recordGrammarUsage } from "../utils/grammar/grammarPointsApi";
import {
  buildReviewSummary,
  buildSentenceCorrectionContext,
  groupByParagraph,
  isAllCorrect,
  isFlawed,
  runSentenceCheck,
  type ReviewSummary,
} from "../utils/writing/sentenceReview";
import { splitIntoSentences } from "../utils/writing/splitSentences";
import { checkWritingTopicRelevance } from "../utils/writing/writingApi";
import styles from "./ListeningWritingBonus.module.css";

type ListeningWritingBonusProps = {
  question: string;
  initialSentenceChecks?: WritingSentenceCheck[] | null;
  onProgressChange?: (sentenceChecks: WritingSentenceCheck[] | null) => void;
};

// Same submit -> topic-relevance check -> per-sentence grammar check flow as
// WritingPracticeDetailPage (shared via utils/writing/sentenceReview), minus
// draft persistence/archiving — this is an ephemeral bonus question attached
// to a listening topic, not a standalone writing-practice topic. The raw
// pre-submit draft is never restored/persisted (only per-check snapshots
// are), so a learner who typed something but never hit Submit loses it on
// reload — matching "no need to save the current state for each input".
export default function ListeningWritingBonus({
  question,
  initialSentenceChecks,
  onProgressChange,
}: ListeningWritingBonusProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation("listening");
  const { t: tWriting } = useTranslation("writing");
  const { t: tChat } = useTranslation("chat");
  const [draft, setDraft] = useState("");
  const [sentenceChecks, setSentenceChecks] = useState<WritingSentenceCheck[] | null>(
    initialSentenceChecks ?? null,
  );
  const [isReviewing, setIsReviewing] = useState(false);
  const [activeSentenceChat, setActiveSentenceChat] = useState<WritingSentenceCheck | null>(
    null,
  );
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [correctingSentence, setCorrectingSentence] = useState<WritingSentenceCheck | null>(
    null,
  );
  const [isCheckingTopic, setIsCheckingTopic] = useState(false);
  const [offTopicWarning, setOffTopicWarning] = useState<string | null>(null);

  function updateSentence(id: string, changes: Partial<WritingSentenceCheck>) {
    setSentenceChecks(
      (previous) =>
        previous?.map((sentence) =>
          sentence.id === id ? { ...sentence, ...changes } : sentence,
        ) ?? previous,
    );
  }

  function creditGrammarUsage(checks: WritingSentenceCheck[]): void {
    const grammarIds = checks.flatMap((sentence) =>
      sentence.grammarPointsCovered.map((point) => point.id),
    );
    if (grammarIds.length === 0) return;
    recordGrammarUsage(grammarIds)
      .then((result) => {
        if (result.updated_grammar_points.length > 0) {
          dispatch(applyGrammarPointUsageUpdates(result.updated_grammar_points));
        }
      })
      .catch(() => {
        // Best-effort, same as the writing-practice page.
      });
  }

  function settleReview(checks: WritingSentenceCheck[], alwaysShowSummary: boolean): void {
    const allCorrect = isAllCorrect(checks);
    if (alwaysShowSummary || allCorrect) {
      setReviewSummary(buildReviewSummary(checks, allCorrect));
    }
    if (allCorrect) {
      creditGrammarUsage(checks);
    }
  }

  async function handleSubmit() {
    const lines = splitIntoSentences(draft);
    if (lines.length === 0) return;

    setIsCheckingTopic(true);
    try {
      const onTopic = await checkWritingTopicRelevance(draft, question);
      if (!onTopic) {
        setOffTopicWarning(
          t("listeningPracticeDetailPage.bonusWritingSection.offTopicWarning"),
        );
        return;
      }
    } catch {
      // Best-effort gate: if the check itself fails, don't block the
      // learner from submitting — fall through to the normal review flow.
    } finally {
      setIsCheckingTopic(false);
    }

    const initialChecks: WritingSentenceCheck[] = lines.map((line, index) => ({
      id: `${index}`,
      paragraphIndex: line.paragraphIndex,
      text: line.text,
      status: "pending",
      severity: null,
      answer: null,
      grammarPointsCovered: [],
    }));

    setSentenceChecks(initialChecks);
    setIsReviewing(true);

    const finalChecks: WritingSentenceCheck[] = [];
    for (const sentence of initialChecks) {
      updateSentence(sentence.id, { status: "checking" });
      const result = await runSentenceCheck(sentence.text);
      const finalSentence: WritingSentenceCheck = { ...sentence, ...result };
      finalChecks.push(finalSentence);
      updateSentence(sentence.id, finalSentence);
    }

    setIsReviewing(false);
    settleReview(finalChecks, true);
    onProgressChange?.(finalChecks);
  }

  async function handleConfirmCorrection(sentenceId: string, correctedText: string) {
    setCorrectingSentence(null);
    updateSentence(sentenceId, {
      text: correctedText,
      status: "checking",
      severity: null,
      answer: null,
      grammarPointsCovered: [],
    });

    const result = await runSentenceCheck(correctedText);
    const updated = (sentenceChecks ?? []).map((sentence) =>
      sentence.id === sentenceId ? { ...sentence, text: correctedText, ...result } : sentence,
    );
    setSentenceChecks(updated);
    settleReview(updated, false);
    onProgressChange?.(updated);
  }

  return (
    <>
      {sentenceChecks === null ? (
        <>
          <div className={styles.bonusTextareaWrapper}>
            <textarea
              className={styles.bonusTextarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={tWriting("writingPracticeDetailPage.textareaPlaceholder")}
              aria-label={t(
                "listeningPracticeDetailPage.bonusWritingSection.textareaAriaLabel",
              )}
            />
            <VoiceInputButton value={draft} onChange={setDraft} className={styles.bonusVoiceButton} />
          </div>
          <div className={styles.bonusSubmitRow}>
            <Button
              kind="confirm"
              variant="page"
              text={
                isCheckingTopic
                  ? tWriting("writingPracticeDetailPage.checkingTopic")
                  : tWriting("writingPracticeDetailPage.submit")
              }
              disabled={draft.trim() === "" || isCheckingTopic}
              onClick={handleSubmit}
            />
          </div>
        </>
      ) : (
        <>
          {isReviewing && (
            <p className={styles.bonusReviewingMessage}>
              {tWriting("writingPracticeDetailPage.reviewingMessage")}
            </p>
          )}
          <div
            className={styles.bonusReviewed}
            aria-label={t(
              "listeningPracticeDetailPage.bonusWritingSection.reviewedAriaLabel",
            )}
          >
            {groupByParagraph(sentenceChecks).map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className={styles.bonusParagraph}>
                {paragraph.map((sentence) => {
                  const clickable = isFlawed(sentence);
                  return (
                    <Fragment key={sentence.id}>
                      <span
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        className={[
                          styles.bonusSentence,
                          sentence.status === "checking" ? styles["bonus-sentence--checking"] : "",
                          sentence.severity ? styles[`bonus-sentence--${sentence.severity}`] : "",
                          clickable ? styles["bonus-sentence--clickable"] : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        title={sentence.answer ?? undefined}
                        onClick={clickable ? () => setActiveSentenceChat(sentence) : undefined}
                        onKeyDown={
                          clickable
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setActiveSentenceChat(sentence);
                                }
                              }
                            : undefined
                        }
                      >
                        {sentence.text}
                      </span>
                      {clickable && (
                        <button
                          type="button"
                          className={styles.bonusSentenceEditButton}
                          aria-label={tWriting("writingPracticeDetailPage.correctButtonAriaLabel", {
                            text: sentence.text,
                          })}
                          onClick={() => setCorrectingSentence(sentence)}
                        >
                          <PenIcon className={styles.bonusSentenceEditIcon} />
                        </button>
                      )}{" "}
                    </Fragment>
                  );
                })}
              </p>
            ))}
          </div>
        </>
      )}
      <WarningModal
        isOpen={offTopicWarning !== null}
        message={offTopicWarning ?? ""}
        onClose={() => setOffTopicWarning(null)}
      />
      {activeSentenceChat && (
        <ChatModal
          character={getTeacherWang(tChat)}
          onClose={() => setActiveSentenceChat(null)}
          initialMessages={[
            {
              role: "assistant",
              content: activeSentenceChat.answer ?? "",
              isDisplayOnly: true,
            },
          ]}
          loadHistory={false}
          allowClearHistory={false}
          ephemeral
          topicContext={buildSentenceCorrectionContext(activeSentenceChat)}
        />
      )}
      {correctingSentence && (
        <SentenceCorrectionModal
          originalText={correctingSentence.text}
          onCancel={() => setCorrectingSentence(null)}
          onConfirm={(correctedText) =>
            handleConfirmCorrection(correctingSentence.id, correctedText)
          }
        />
      )}
      {reviewSummary && (
        <WritingReviewModal
          allCorrect={reviewSummary.allCorrect}
          grammarPointTitles={reviewSummary.grammarPointTitles}
          onClose={() => {
            const wasAllCorrect = reviewSummary.allCorrect;
            setReviewSummary(null);
            if (wasAllCorrect) {
              setDraft("");
              setSentenceChecks(null);
            }
          }}
        />
      )}
    </>
  );
}
