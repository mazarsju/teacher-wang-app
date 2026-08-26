import { useState } from "react";
import Button from "../components/Button";
import Page from "../components/Page";
import { getWritingContext } from "../data/writingContext";
import { WRITING_TOPICS } from "../data/writingTopics";
import { renderFormattedText } from "../utils/formatMarkdownText";
import styles from "./WritingPracticeDetailPage.module.css";

type WritingDetailTab = "context" | "writing";

type WritingPracticeDetailPageProps = {
  topicId: string;
  onBack: () => void;
};

export default function WritingPracticeDetailPage({
  topicId,
  onBack,
}: WritingPracticeDetailPageProps) {
  const topic = WRITING_TOPICS.find((candidate) => candidate.id === topicId);
  const context = getWritingContext(topicId);
  const [activeTab, setActiveTab] = useState<WritingDetailTab>("context");
  const [draft, setDraft] = useState("");

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
        <textarea
          className={styles.writingDetailTextarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write in Chinese..."
          aria-label="Your writing"
        />
        <div className={styles.writingDetailSubmitRow}>
          <Button kind="confirm" variant="page" text="Submit" />
        </div>
      </div>
    </Page>
  );
}
