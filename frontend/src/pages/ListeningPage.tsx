import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import animalsTopicImage from "../assets/listening/animals.png";
import familyTopicImage from "../assets/listening/family.png";
import foodTopicImage from "../assets/listening/food.png";
import friendsTopicImage from "../assets/listening/friends.png";
import healthTopicImage from "../assets/listening/health.png";
import numbersTopicImage from "../assets/listening/numbers.png";
import schoolTopicImage from "../assets/listening/school.png";
import shoppingTopicImage from "../assets/listening/shopping.png";
import sportTopicImage from "../assets/listening/sport.png";
import studyTopicImage from "../assets/listening/study.png";
import timeTopicImage from "../assets/listening/time.png";
import travelTopicImage from "../assets/listening/travel.png";
import workTopicImage from "../assets/listening/work.png";
import cultureTopicImage from "../assets/listening/culture.png";
import hobbiesTopicImage from "../assets/listening/hobbies.png";
import historyTopicImage from "../assets/listening/history.png";
import weatherTopicImage from "../assets/listening/weather.png";
import transportationTopicImage from "../assets/listening/transportation.png";
import housingTopicImage from "../assets/listening/housing.png";
import natureTopicImage from "../assets/listening/nature.png";
import relationshipsTopicImage from "../assets/listening/relationships.png";
import {
  HappyFaceIcon,
  NeutralFaceIcon,
  UnhappyFaceIcon,
  VeryHappyFaceIcon,
} from "../components/icons";
import ListeningScoreModal from "../components/ListeningScoreModal";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setListeningPractices } from "../store/slices/listeningSlice";
import type { ListeningPractice } from "../types/listeningPractice";
import {
  fetchListeningPractices,
  refreshListeningPractices,
} from "../utils/listening/listeningApi";
import { overallScore, scoreTier, type ScoreTier } from "../utils/listening/overallScore";
import ListeningPracticeDetailPage from "./ListeningPracticeDetailPage";
import styles from "./ListeningPage.module.css";

const TIER_FACE_ICON: Record<ScoreTier, typeof VeryHappyFaceIcon> = {
  excellent: VeryHappyFaceIcon,
  good: HappyFaceIcon,
  fair: NeutralFaceIcon,
  poor: UnhappyFaceIcon,
};

const TOPIC_IMAGE: Record<string, string> = {
  animals: animalsTopicImage,
  family: familyTopicImage,
  food: foodTopicImage,
  friends: friendsTopicImage,
  health: healthTopicImage,
  numbers: numbersTopicImage,
  school: schoolTopicImage,
  shopping: shoppingTopicImage,
  sport: sportTopicImage,
  study: studyTopicImage,
  time: timeTopicImage,
  travel: travelTopicImage,
  work: workTopicImage,
  culture: cultureTopicImage,
  hobbies: hobbiesTopicImage,
  history: historyTopicImage,
  weather: weatherTopicImage,
  transportation: transportationTopicImage,
  housing: housingTopicImage,
  nature: natureTopicImage,
  relationships: relationshipsTopicImage
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
  const dispatch = useAppDispatch();
  const practices = useAppSelector((state) => state.listening.items);
  const listeningLoaded = useAppSelector((state) => state.listening.loaded);
  const [isLoading, setIsLoading] = useState(!listeningLoaded);
  const [error, setError] = useState<string | null>(null);
  const [selectedPractice, setSelectedPractice] =
    useState<ListeningPractice | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  useEffect(() => {
    if (listeningLoaded) return;
    let cancelled = false;

    refreshListeningPractices()
      .then(() => fetchListeningPractices())
      .then((result) => {
        if (!cancelled) {
          dispatch(setListeningPractices(result));
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
    // listeningLoaded is intentionally excluded: this dispatches
    // setListeningPractices, which flips listeningLoaded itself, and
    // re-running on that flip would cancel this same in-flight fetch before
    // its `finally` clears isLoading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, t]);

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

  const activePractices = sortedPractices.filter(
    (practice) => practice.status !== "DONE",
  );
  const completedPractices = sortedPractices.filter(
    (practice) => practice.status === "DONE",
  );

  if (selectedTopicId !== null) {
    return (
      <ListeningPracticeDetailPage
        topicId={selectedTopicId}
        onBack={() => setSelectedTopicId(null)}
      />
    );
  }

  function renderTile(practice: ListeningPractice) {
    const tier = scoreTier(
      overallScore(practice.vocabulary_score, practice.grammar_score),
    );
    const FaceIcon = TIER_FACE_ICON[tier];
    const topicImage = TOPIC_IMAGE[practice.topic];
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
        {topicImage && (
          <img
            className={styles.listeningTileImage}
            src={topicImage}
            alt={practice.translated_topic}
          />
        )}
        <div className={styles.listeningTileMain}>
          <span className={styles.listeningTileTitle}>{practice.title}</span>
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
            {!topicImage && (
              <span
                className={`${styles.listeningBadge} ${
                  styles[`listening-badge-${badgePaletteIndex(practice.topic)}`]
                }`}
              >
                {practice.translated_topic}
              </span>
            )}
          </div>
        </div>
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
        >
          <FaceIcon className={styles.listeningScoreIconGlyph} />
        </button>
      </div>
    );
  }

  return (
    <Page title={t("listeningPage.title")}>
      {isLoading && <p>{t("listeningPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && sortedPractices.length === 0 && (
        <p>{t("listeningPage.empty")}</p>
      )}
      {!isLoading && !error && activePractices.length > 0 && (
        <div className={styles.listeningMosaic}>
          {activePractices.map(renderTile)}
        </div>
      )}
      {!isLoading && !error && completedPractices.length > 0 && (
        <details className={styles.listeningCompletedSection}>
          <summary className={styles.listeningCompletedSummary}>
            {t("listeningPage.completedSection.summary", {
              count: completedPractices.length,
            })}
          </summary>
          <div className={styles.listeningMosaic}>
            {completedPractices.map(renderTile)}
          </div>
        </details>
      )}
      <ListeningScoreModal
        practice={selectedPractice}
        onClose={() => setSelectedPractice(null)}
      />
    </Page>
  );
}
