import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ListeningScoreModal from "../components/ListeningScoreModal";
import Page from "../components/Page";
import type { ListeningPractice } from "../types/listeningPractice";
import { fetchListeningPractices } from "../utils/listening/listeningApi";
import { overallScore, scoreTier } from "../utils/listening/overallScore";
import ListeningPracticeDetailPage from "./ListeningPracticeDetailPage";
import styles from "./ListeningPage.module.css";

export default function ListeningPage() {
  const { t } = useTranslation("listening");
  const [practices, setPractices] = useState<ListeningPractice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPractice, setSelectedPractice] =
    useState<ListeningPractice | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchListeningPractices()
      .then((result) => {
        if (!cancelled) {
          setPractices(result);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t("listeningPage.loadError"),
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
  }, [t]);

  const sortedPractices = useMemo(
    () =>
      practices
        .slice()
        .sort(
          (a, b) =>
            overallScore(b.vocabulary_score, b.grammar_score) -
            overallScore(a.vocabulary_score, a.grammar_score),
        ),
    [practices],
  );

  if (selectedTopicId !== null) {
    return (
      <ListeningPracticeDetailPage
        topicId={selectedTopicId}
        onBack={() => setSelectedTopicId(null)}
      />
    );
  }

  return (
    <Page title={t("listeningPage.title")}>
      {isLoading && <p>{t("listeningPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && sortedPractices.length === 0 && (
        <p>{t("listeningPage.empty")}</p>
      )}
      {!isLoading && !error && sortedPractices.length > 0 && (
        <div className={styles.listeningMosaic}>
          {sortedPractices.map((practice) => {
            const tier = scoreTier(
              overallScore(practice.vocabulary_score, practice.grammar_score),
            );
            return (
              <div
                key={practice.id}
                className={styles.listeningTile}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTopicId(practice.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedTopicId(practice.id);
                  }
                }}
              >
                <span className={styles.listeningTileTitle}>
                  {practice.title}
                </span>
                <button
                  type="button"
                  className={`${styles.listeningScoreIcon} ${styles[`listening-score-icon-${tier}`]}`}
                  aria-label={t("listeningPage.scoreIconAriaLabel", {
                    title: practice.title,
                  })}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedPractice(practice);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      <ListeningScoreModal
        practice={selectedPractice}
        onClose={() => setSelectedPractice(null)}
      />
    </Page>
  );
}
