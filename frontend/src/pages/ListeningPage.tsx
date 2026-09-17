import { useMemo, useState } from "react";
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
import environmentTopicImage from "../assets/listening/environment.png";
import technologyTopicImage from "../assets/listening/technology.png";
import psychologyTopicImage from "../assets/listening/psychology.png";
import {
  HappyFaceIcon,
  NeutralFaceIcon,
  UnhappyFaceIcon,
  VeryHappyFaceIcon,
} from "../components/icons";
import ListeningScoreModal from "../components/ListeningScoreModal";
import Page from "../components/Page";
import { useAppSelector } from "../store/hooks";
import type { ListeningPractice } from "../types/listeningPractice";
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
  relationships: relationshipsTopicImage,
  environment: environmentTopicImage,
  technology: technologyTopicImage,
  psychology: psychologyTopicImage
};

const BADGE_PALETTE_SIZE = 8;

function badgePaletteIndex(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % BADGE_PALETTE_SIZE) + 1;
}

// Every listening-content `type` value the app knows how to label — see
// `listeningPage.type.*` in the locale files and `ListeningPractice.type`'s
// docstring in the backend model.
const LISTENING_TYPES = [
  "dialog",
  "fiction_story",
  "personal_story",
  "explanatory_text",
] as const;

const HSK_FILTER_ALL = "all";
const TYPE_FILTER_ALL = "all";

function isMadeForYou(practice: ListeningPractice, currentHskLevel: number): boolean {
  const tier = scoreTier(overallScore(practice.vocabulary_score, practice.grammar_score));
  const isGoodFit = tier === "excellent" || tier === "good";
  const isNearLevel = Math.abs(practice.hsk_level - currentHskLevel) <= 1;
  return isGoodFit && isNearLevel;
}

export default function ListeningPage() {
  const { t } = useTranslation("listening");
  const practices = useAppSelector((state) => state.listening.items);
  // "Your level" for isMadeForYou/proximity — defaults to 1, same as the
  // backend's get_user_hsk_level did, distinct from targetHskLevel below.
  const currentHskLevel = useAppSelector((state) => state.hsk.currentLevelLight ?? 1);
  const loadedLevels = useAppSelector((state) => state.listening.loadedLevels);
  const isLoading = useAppSelector((state) => !state.listening.loaded);
  const error = useAppSelector((state) => state.listening.error);
  const [selectedPractice, setSelectedPractice] =
    useState<ListeningPractice | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [hskFilter, setHskFilter] = useState<string>(HSK_FILTER_ALL);
  const [typeFilter, setTypeFilter] = useState<string>(TYPE_FILTER_ALL);
  const [madeForYouOnly, setMadeForYouOnly] = useState(false);

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

  const availableHskLevels = useMemo(
    () => [...new Set(practices.map((practice) => practice.hsk_level))].sort(
      (a, b) => a - b,
    ),
    [practices],
  );

  const filteredPractices = sortedPractices.filter((practice) => {
    if (hskFilter !== HSK_FILTER_ALL && practice.hsk_level !== Number(hskFilter)) {
      return false;
    }
    if (typeFilter !== TYPE_FILTER_ALL && practice.type !== typeFilter) {
      return false;
    }
    if (madeForYouOnly && !isMadeForYou(practice, currentHskLevel)) {
      return false;
    }
    return true;
  });

  const activePractices = filteredPractices.filter(
    (practice) => practice.status !== "DONE",
  );
  const completedPractices = filteredPractices.filter(
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
    const levelLoaded = loadedLevels.includes(practice.hsk_level);
    const tier = scoreTier(
      overallScore(practice.vocabulary_score, practice.grammar_score),
    );
    const FaceIcon = TIER_FACE_ICON[tier];
    const topicImage = TOPIC_IMAGE[practice.topic];
    const tierModifier = levelLoaded ? tier : "loading";
    return (
      <div
        key={practice.id}
        className={`${styles.listeningTile} ${styles[`listening-tile-${tierModifier}`]}`}
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
          className={`${styles.listeningScoreIcon} ${
            styles[`listening-score-icon-${tierModifier}`]
          }`}
          aria-label={
            levelLoaded
              ? t("listeningPage.scoreIconAriaLabel", { title: practice.title })
              : t("listeningPage.loading")
          }
          disabled={!levelLoaded}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedPractice(practice);
          }}
        >
          {levelLoaded ? (
            <FaceIcon className={styles.listeningScoreIconGlyph} />
          ) : (
            <span className={styles.listeningScoreIconSpinner} aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }

  return (
    <Page title={t("listeningPage.title")}>
      {isLoading && <p>{t("listeningPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && sortedPractices.length > 0 && (
        <div className={styles.listeningFilters}>
          <label className={styles.listeningFilterField}>
            <span className={styles.listeningFilterLabel}>
              {t("listeningPage.filters.hskLevel.label")}
            </span>
            <select
              className={styles.listeningFilterSelect}
              value={hskFilter}
              onChange={(event) => setHskFilter(event.target.value)}
            >
              <option value={HSK_FILTER_ALL}>
                {t("listeningPage.filters.hskLevel.all")}
              </option>
              {availableHskLevels.map((level) => (
                <option key={level} value={level}>
                  {t("listeningPage.filters.hskLevel.option", { level })}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.listeningFilterField}>
            <span className={styles.listeningFilterLabel}>
              {t("listeningPage.filters.type.label")}
            </span>
            <select
              className={styles.listeningFilterSelect}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value={TYPE_FILTER_ALL}>
                {t("listeningPage.filters.type.all")}
              </option>
              {LISTENING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`listeningPage.type.${type}`, { defaultValue: type })}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.listeningFilterField} ${styles.listeningFilterToggle}`}>
            <span className={styles.listeningFilterLabel}>
              {t("listeningPage.filters.madeForYou.label")}
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                role="switch"
                checked={madeForYouOnly}
                onChange={(event) => setMadeForYouOnly(event.target.checked)}
              />
              <span className="toggle-slider" />
            </span>
          </label>
        </div>
      )}
      {!isLoading && !error && sortedPractices.length === 0 && (
        <p>{t("listeningPage.empty")}</p>
      )}
      {!isLoading &&
        !error &&
        sortedPractices.length > 0 &&
        filteredPractices.length === 0 && (
          <p>
            {t(
              madeForYouOnly
                ? "listeningPage.filters.notFitForLevel"
                : "listeningPage.filters.noResults",
            )}
          </p>
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
