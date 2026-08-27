import { Fragment, useEffect, useState } from "react";
import Button from "../components/Button";
import ChatModal from "../components/ChatModal";
import ConfirmModal from "../components/ConfirmModal";
import { PenIcon } from "../components/icons";
import Page from "../components/Page";
import SentenceCorrectionModal from "../components/SentenceCorrectionModal";
import WritingReviewModal from "../components/WritingReviewModal";
import { TEACHER_WANG } from "../data/chatCharacters";
import { getWritingContext } from "../data/writingContext";
import { WRITING_TOPICS } from "../data/writingTopics";
import type { CoveredGrammarPoint, WritingSentenceCheck } from "../types/writingSentence";
import { renderFormattedText } from "../utils/formatMarkdownText";
import { detectGrammarPoints, recordGrammarUsage } from "../utils/grammar/grammarPointsApi";
import { formatDateTime } from "../utils/knowledgeBase/formatDateTime";
import { splitIntoSentences } from "../utils/writing/splitSentences";
import {
  checkWritingSentence,
  completeWritingDraft,
  fetchWritingDraft,
  saveWritingDraft,
} from "../utils/writing/writingApi";
import type { WritingArchiveEntry } from "../utils/writing/writingApi";
import styles from "./WritingPracticeDetailPage.module.css";

type WritingDetailTab = "context" | "writing" | "completed";

type WritingPracticeDetailPageProps = {
  topicId: string;
  onBack: () => void;
};

type ReviewSummary = {
  allCorrect: boolean;
  grammarPointTitles: string[];
};

function groupByParagraph(sentences: WritingSentenceCheck[]): WritingSentenceCheck[][] {
  const paragraphs: WritingSentenceCheck[][] = [];
  for (const sentence of sentences) {
    const lastParagraph = paragraphs[paragraphs.length - 1];
    if (lastParagraph && lastParagraph[0]?.paragraphIndex === sentence.paragraphIndex) {
      lastParagraph.push(sentence);
    } else {
      paragraphs.push([sentence]);
    }
  }
  return paragraphs;
}

// Reconstructs the full draft text from sentence checks so edits made
// through the correction modal are what gets saved/archived, not the
// pre-submit textarea value.
function joinSentenceChecks(checks: WritingSentenceCheck[]): string {
  return groupByParagraph(checks)
    .map((paragraph) => paragraph.map((sentence) => sentence.text).join(" "))
    .join("\n");
}

function isFlawed(sentence: WritingSentenceCheck): boolean {
  return sentence.status === "done" && sentence.severity !== null && sentence.severity !== "none";
}

function buildSentenceCorrectionContext(sentence: WritingSentenceCheck): string {
  return `# Writing correction\n\nThe learner wrote: "${sentence.text}"\n\n${sentence.answer}`;
}

type SentenceCheckResult = Pick<
  WritingSentenceCheck,
  "status" | "severity" | "answer" | "grammarPointsCovered"
>;

async function runSentenceCheck(text: string): Promise<SentenceCheckResult> {
  try {
    const correction = await checkWritingSentence(text);
    let grammarPointsCovered: CoveredGrammarPoint[] = [];
    if (correction.severity === "none") {
      try {
        grammarPointsCovered = await detectGrammarPoints(text);
      } catch {
        // Grammar-rule detection is a bonus signal; a failure here
        // shouldn't block showing the correctness result.
      }
    }
    return {
      status: "done",
      severity: correction.severity,
      answer: correction.answer ?? null,
      grammarPointsCovered,
    };
  } catch {
    return { status: "error", severity: null, answer: null, grammarPointsCovered: [] };
  }
}

function buildReviewSummary(checks: WritingSentenceCheck[]): ReviewSummary {
  const covered = checks.flatMap((sentence) => sentence.grammarPointsCovered);
  return {
    allCorrect: checks.every((sentence) => sentence.severity === "none"),
    grammarPointTitles: [...new Set(covered.map((point) => point.title))],
  };
}

// Only recorded once the whole text is correct — a point used while other
// sentences still have mistakes doesn't get credit yet. One id per usage
// (not deduped), matching how the backend increments per occurrence.
function recordGrammarUsageIfAllCorrect(checks: WritingSentenceCheck[]): void {
  if (!checks.every((sentence) => sentence.severity === "none")) return;
  const grammarIds = checks.flatMap((sentence) =>
    sentence.grammarPointsCovered.map((point) => point.id),
  );
  if (grammarIds.length === 0) return;
  recordGrammarUsage(grammarIds).catch(() => {
    // Best-effort: the review modal already celebrated the correct text;
    // a failed usage recording shouldn't surface as a user-facing error.
  });
}

export default function WritingPracticeDetailPage({
  topicId,
  onBack,
}: WritingPracticeDetailPageProps) {
  const topic = WRITING_TOPICS.find((candidate) => candidate.id === topicId);
  const context = getWritingContext(topicId);
  const [activeTab, setActiveTab] = useState<WritingDetailTab>("context");
  const [draft, setDraft] = useState("");
  const [sentenceChecks, setSentenceChecks] = useState<WritingSentenceCheck[] | null>(
    null,
  );
  const [isReviewing, setIsReviewing] = useState(false);
  const [activeSentenceChat, setActiveSentenceChat] = useState<WritingSentenceCheck | null>(
    null,
  );
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [correctingSentence, setCorrectingSentence] = useState<WritingSentenceCheck | null>(
    null,
  );
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [archive, setArchive] = useState<WritingArchiveEntry[]>([]);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [isDeleteDraftConfirmOpen, setIsDeleteDraftConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchWritingDraft(topicId)
      .then((saved) => {
        if (cancelled) return;
        if (typeof saved.draft === "string") setDraft(saved.draft);
        if (Array.isArray(saved.archive)) setArchive(saved.archive);
      })
      .catch(() => {
        // No saved draft yet (or it failed to load) — start from a blank page.
      });

    return () => {
      cancelled = true;
    };
  }, [topicId]);

  // Best-effort, like recordGrammarUsageIfAllCorrect below: archiving is a
  // bonus record of a completed text, not something that should surface as
  // a user-facing error on top of the review modal that already celebrated it.
  function archiveIfAllCorrect(checks: WritingSentenceCheck[]): void {
    if (!checks.every((sentence) => sentence.severity === "none")) return;
    completeWritingDraft(topicId, joinSentenceChecks(checks))
      .then((saved) => setArchive(saved.archive))
      .catch(() => {});
  }

  async function handleSaveDraft() {
    setIsSavingDraft(true);
    setDraftSaveError(null);
    try {
      await saveWritingDraft(topicId, draft);
    } catch (error) {
      setDraftSaveError(
        error instanceof Error ? error.message : "Failed to save your draft.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleDeleteDraft() {
    setIsDeleteDraftConfirmOpen(false);
    setIsDeletingDraft(true);
    setDraftSaveError(null);
    try {
      await saveWritingDraft(topicId, "");
      setDraft("");
      setSentenceChecks(null);
    } catch {
      // saveWritingDraft's own error message is written for the "Save draft"
      // button; show a delete-specific one here instead.
      setDraftSaveError("Failed to delete your draft.");
    } finally {
      setIsDeletingDraft(false);
    }
  }

  function updateSentence(id: string, changes: Partial<WritingSentenceCheck>) {
    setSentenceChecks(
      (previous) =>
        previous?.map((sentence) =>
          sentence.id === id ? { ...sentence, ...changes } : sentence,
        ) ?? previous,
    );
  }

  async function handleSubmit() {
    const lines = splitIntoSentences(draft);
    if (lines.length === 0) return;

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
    saveWritingDraft(topicId, draft).catch(() => {});

    // Tracked locally (not read back from state) since state updates from
    // the loop below don't land in this closure's `sentenceChecks`.
    const finalChecks: WritingSentenceCheck[] = [];

    for (const sentence of initialChecks) {
      updateSentence(sentence.id, { status: "checking" });

      const result = await runSentenceCheck(sentence.text);
      const finalSentence: WritingSentenceCheck = { ...sentence, ...result };

      finalChecks.push(finalSentence);
      updateSentence(sentence.id, finalSentence);
    }

    setIsReviewing(false);
    setReviewSummary(buildReviewSummary(finalChecks));
    recordGrammarUsageIfAllCorrect(finalChecks);
    archiveIfAllCorrect(finalChecks);
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

    // Computed from this closure's `sentenceChecks`, not a setState updater:
    // nothing else touches sentence state while a correction is in flight
    // (only one correction modal can be open at a time), and recording usage
    // is a real network side effect that must not run twice, which a React
    // 18 Strict Mode double-invoked updater would risk.
    const updated = (sentenceChecks ?? []).map((sentence) =>
      sentence.id === sentenceId ? { ...sentence, text: correctedText, ...result } : sentence,
    );
    setSentenceChecks(updated);
    saveWritingDraft(topicId, joinSentenceChecks(updated)).catch(() => {});

    if (updated.every((sentence) => sentence.severity === "none")) {
      setReviewSummary(buildReviewSummary(updated));
      recordGrammarUsageIfAllCorrect(updated);
      archiveIfAllCorrect(updated);
    }
  }

  return (
    <Page
      title={topic?.title ?? "Writing"}
      fullWidth={activeTab === "writing"}
      headerAction={
        <Button kind="cancel" variant="page" text="Back" onClick={onBack} />
      }
    >
      <div className={styles.writingDetailTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "context"}
          className={
            activeTab === "context"
              ? `${styles.writingDetailTab} ${styles.writingDetailTabActive}`
              : styles.writingDetailTab
          }
          onClick={() => setActiveTab("context")}
        >
          Context
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "writing"}
          className={
            activeTab === "writing"
              ? `${styles.writingDetailTab} ${styles.writingDetailTabActive}`
              : styles.writingDetailTab
          }
          onClick={() => setActiveTab("writing")}
        >
          Writing
        </button>
        {archive.length > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "completed"}
            className={
              activeTab === "completed"
                ? `${styles.writingDetailTab} ${styles.writingDetailTabActive}`
                : styles.writingDetailTab
            }
            onClick={() => setActiveTab("completed")}
          >
            Completed versions
          </button>
        )}
      </div>
      <div
        className={
          activeTab === "context" ? styles.writingDetailContext : styles.writingDetailHidden
        }
      >
        {context ? renderFormattedText(context) : "No context available yet."}
      </div>
      <div
        className={
          activeTab === "writing" ? styles.writingDetailWriting : styles.writingDetailHidden
        }
      >
        {sentenceChecks === null ? (
          <>
            <textarea
              className={styles.writingDetailTextarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write in Chinese..."
              aria-label="Your writing"
            />
            {draftSaveError && <p className="table-error">{draftSaveError}</p>}
            <div className={styles.writingDetailSubmitRow}>
              <Button
                kind="cancel"
                variant="page"
                text={isSavingDraft ? "Saving..." : "Save draft"}
                disabled={isSavingDraft}
                onClick={handleSaveDraft}
              />
              <Button
                kind="danger"
                variant="page"
                text={isDeletingDraft ? "Deleting..." : "Delete draft"}
                disabled={isDeletingDraft || draft.trim() === ""}
                onClick={() => setIsDeleteDraftConfirmOpen(true)}
              />
              <Button
                kind="confirm"
                variant="page"
                text="Submit"
                disabled={draft.trim() === ""}
                onClick={handleSubmit}
              />
            </div>
          </>
        ) : (
          <>
            {isReviewing && (
              <p className={styles.writingDetailReviewingMessage}>
                Your text is currently under review...
              </p>
            )}
            <div className={styles.writingDetailReviewed} aria-label="Your writing">
              {groupByParagraph(sentenceChecks).map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className={styles.writingDetailParagraph}>
                  {paragraph.map((sentence) => {
                    const clickable = isFlawed(sentence);
                    return (
                      <Fragment key={sentence.id}>
                        <span
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          className={[
                            styles.writingSentence,
                            sentence.status === "checking"
                              ? styles["writing-sentence--checking"]
                              : "",
                            sentence.severity
                              ? styles[`writing-sentence--${sentence.severity}`]
                              : "",
                            clickable ? styles["writing-sentence--clickable"] : "",
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
                            className={styles.writingSentenceEditButton}
                            aria-label={`Correct: ${sentence.text}`}
                            onClick={() => setCorrectingSentence(sentence)}
                          >
                            <PenIcon className={styles.writingSentenceEditIcon} />
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
      </div>
      {activeTab === "completed" && archive.length > 0 && (
        <div className={styles.writingDetailContext}>
          {[...archive].reverse().map((entry, index) => (
            <details
              key={entry.timestamp}
              open={index === 0}
              className={styles.writingArchiveEntry}
            >
              <summary className={styles.writingArchiveSummary}>
                {formatDateTime(entry.timestamp)}
              </summary>
              <div className={styles.writingArchiveContent}>{entry.content}</div>
            </details>
          ))}
        </div>
      )}
      <ConfirmModal
        isOpen={isDeleteDraftConfirmOpen}
        message="Are you sure you want to delete your draft for this topic?"
        danger
        onCancel={() => setIsDeleteDraftConfirmOpen(false)}
        onConfirm={handleDeleteDraft}
      />
      {activeSentenceChat && (
        <ChatModal
          character={TEACHER_WANG}
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
              saveWritingDraft(topicId, "").catch(() => {});
            }
          }}
        />
      )}
    </Page>
  );
}
