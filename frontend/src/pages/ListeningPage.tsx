import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ListeningScoreModal from "../components/ListeningScoreModal";
import Page from "../components/Page";
import type { ListeningPractice } from "../types/listeningPractice";
import { fetchListeningPractices } from "../utils/listening/listeningApi";
import { overallScore, scoreTier, type ScoreTier } from "../utils/listening/overallScore";
import ListeningPracticeDetailPage from "./ListeningPracticeDetailPage";
import styles from "./ListeningPage.module.css";

const TIER_EMOJI: Record<ScoreTier, string> = {
  excellent: "😄",
  good: "🙂",
  fair: "😐",
  poor: "🙁",
};

const BADGE_PALETTE_SIZE = 8;

function badgePaletteIndex(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % BADGE_PALETTE_SIZE) + 1;
}

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
                className={`${styles.listeningTile} ${styles[`listening-tile-${tier}`]}`}
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
                <div className={styles.listeningTileMain}>
                  <span className={styles.listeningTileTitle}>
                    {practice.title}
                  </span>
                  <div className={styles.listeningTileBadges}>
                    <span
                      className={`${styles.listeningBadge} ${
                        styles[`listening-badge-${badgePaletteIndex(practice.type)}`]
                      }`}
                    >
                      {t(`listeningPage.type.${practice.type}`, {
                        defaultValue: practice.type,
                      })}
                    </span>
                    <span
                      className={`${styles.listeningBadge} ${
                        styles[`listening-badge-${badgePaletteIndex(practice.topic)}`]
                      }`}
                    >
                      {t(`listeningPage.topic.${practice.topic}`, {
                        defaultValue: practice.topic,
                      })}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.listeningScoreIcon}
                  aria-label={t("listeningPage.scoreIconAriaLabel", {
                    title: practice.title,
                  })}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedPractice(practice);
                  }}
                >
                  {TIER_EMOJI[tier]}
                </button>
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
