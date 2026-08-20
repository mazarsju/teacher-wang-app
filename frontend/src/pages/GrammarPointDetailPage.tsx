import { useEffect, useState } from "react";
import Button from "../components/Button";
import Page from "../components/Page";
import type { GrammarPointDetail } from "../types/grammarPoint";
import { renderFormattedText } from "../utils/formatMarkdownText";
import { fetchGrammarPointDetail } from "../utils/grammar/grammarPointsApi";
import styles from "./GrammarPointDetailPage.module.css";

type GrammarDetailTab = "explanation" | "exercises";

type GrammarPointDetailPageProps = {
  grammarId: string;
  onBack: () => void;
};

export default function GrammarPointDetailPage({
  grammarId,
  onBack,
}: GrammarPointDetailPageProps) {
  const [detail, setDetail] = useState<GrammarPointDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GrammarDetailTab>("explanation");

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

  return (
    <Page
      title={detail?.title ?? "Grammar topic"}
      headerAction={
        <Button kind="cancel" variant="page" text="Back" onClick={onBack} />
      }
    >
      {isLoading && <p>Loading grammar topic...</p>}
      {error && <p className="table-error">{error}</p>}
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
          </div>
          {activeTab === "explanation" && (
            <div className={styles.grammarDetailExplanation}>
              {detail.explanation
                ? renderFormattedText(detail.explanation.replace(/\n{2,}/g, "\n"))
                : "No explanation available yet."}
            </div>
          )}
          {activeTab === "exercises" && (
            <p className={styles.grammarDetailTodo}>TODO</p>
          )}
        </>
      )}
    </Page>
  );
}
