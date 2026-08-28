import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Banner from "../components/Banner";
import KnowledgeBaseInitWizardModal from "../components/KnowledgeBaseInitWizardModal";
import MissingHskCharactersModal from "../components/MissingHskCharactersModal";
import type { PageId } from "../components/Navbar";
import { InfoIcon, TrophyIcon } from "../components/icons";
import Page from "../components/Page";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setWeeklyArticle } from "../store/slices/weeklyArticleSlice";
import { getMotivationMessages } from "../utils/knowledgeBase/homeMotivation";
import { fetchWeeklyArticle } from "../utils/knowledgeBase/weeklyArticleApi";
import Button from "../components/Button";
import characterWordsStyles from "../components/CharacterWordsModal.module.css";
import styles from "./HomePage.module.css";

const ONBOARDING_WORD_THRESHOLD = 10;

type HomePageProps = { onNavigate?: (page: PageId) => void };

export default function HomePage({ onNavigate }: HomePageProps) {
  const { t } = useTranslation(["home", "common"]);
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.characters.items);
  const words = useAppSelector((state) => state.words.items);
  const hskLevelStatus = useAppSelector((state) => state.hsk.status);
  const syncStatus = useAppSelector((state) => state.sync.status);
  const syncError = useAppSelector((state) => state.sync.error);
  const lastSyncedAt = useAppSelector((state) => state.sync.lastSyncedAt);
  const weeklyArticle = useAppSelector((state) => state.weeklyArticle.article);
  const weeklyArticleLoaded = useAppSelector((state) => state.weeklyArticle.loaded);
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [isHskInfoOpen, setIsHskInfoOpen] = useState(false);
  const [isInitWizardOpen, setIsInitWizardOpen] = useState(false);
  const [isWeeklyArticleLoading, setIsWeeklyArticleLoading] = useState(
    !weeklyArticleLoaded,
  );
  const [weeklyArticleError, setWeeklyArticleError] = useState<string | null>(
    null,
  );

  const loadWeeklyArticle = useCallback(async () => {
    setWeeklyArticleError(null);
    try {
      dispatch(setWeeklyArticle(await fetchWeeklyArticle()));
    } catch (loadError) {
      setWeeklyArticleError(
        loadError instanceof Error
          ? loadError.message
          : t("homePage.article.loadError"),
      );
    } finally {
      setIsWeeklyArticleLoading(false);
    }
  }, [dispatch, t]);

  useEffect(() => {
    if (weeklyArticleLoaded) return;
    void loadWeeklyArticle();
  }, [loadWeeklyArticle, weeklyArticleLoaded]);

  const hasSyncedData = lastSyncedAt !== null;
  const isLoading =
    !hasSyncedData && (syncStatus === "idle" || syncStatus === "loading");
  const error = !hasSyncedData ? syncError : null;

  const recognizedCount = characters.length;
  const writingCount = useMemo(
    () => characters.filter((character) => character.writing_known).length,
    [characters],
  );
  const motivationMessages = useMemo(
    () => getMotivationMessages(recognizedCount),
    [recognizedCount],
  );

  const hskTitle =
    hskLevelStatus === null
      ? ""
      : hskLevelStatus.current_level === null
        ? t("homePage.hskCard.titleStart")
        : hskLevelStatus.current_level === hskLevelStatus.max_level
          ? t("homePage.hskCard.titleMax", { level: hskLevelStatus.max_level })
          : t("homePage.hskCard.titleCurrent", {
              level: hskLevelStatus.current_level,
            });

  const hskProgressLabel =
    hskLevelStatus === null
      ? ""
      : hskLevelStatus.next_level === null
        ? t("homePage.hskCard.progressLabelMax")
        : t("homePage.hskCard.progressLabel", {
            count: hskLevelStatus.characters_to_next_level,
            level: hskLevelStatus.next_level,
          });

  const completionPercent =
    hskLevelStatus === null
      ? 0
      : Math.round(hskLevelStatus.completion_ratio * 100);

  return (
    <Page title={t("homePage.title")}>
      {words.length < ONBOARDING_WORD_THRESHOLD && (
        <Banner
          type="info"
          message={t("homePage.banner.message")}
          buttonMessage={t("homePage.banner.buttonMessage")}
          actionOnButtonClick={() => setIsInitWizardOpen(true)}
        />
      )}
      <KnowledgeBaseInitWizardModal
        isOpen={isInitWizardOpen}
        onClose={() => setIsInitWizardOpen(false)}
        onNavigate={onNavigate}
      />
      {isLoading && <p>{t("homePage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && hskLevelStatus !== null && (
        <>
          <section className={styles.homeHskCard} aria-label={t("homePage.hskCard.ariaLabel")}>
            <div className={styles.homeHskBadge}>
              <span className={styles.homeHskBadgeLabel}>{t("homePage.hskCard.badgeLabel")}</span>
              <span className={styles.homeHskBadgeLevel}>
                {hskLevelStatus.current_level ?? t("homePage.hskCard.levelPlaceholder")}
              </span>
            </div>
            <div className={styles.homeHskContent}>
              <div className={styles.homeHskTitleRow}>
                <p className={styles.homeHskTitle}>{hskTitle}</p>
                <button
                  type="button"
                  className="home-hsk-info-button"
                  aria-label={t("homePage.hskCard.infoButtonAriaLabel")}
                  onClick={() => setIsHskInfoOpen(true)}
                >
                  <InfoIcon className="home-hsk-info-icon" />
                </button>
              </div>
              <div
                className={styles.homeHskProgressTrack}
                role="progressbar"
                aria-valuenow={Math.round(hskLevelStatus.progress_to_next_level)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("homePage.hskCard.progressBarAriaLabel")}
              >
                <div
                  className={styles.homeHskProgressFill}
                  style={{
                    width: `${hskLevelStatus.progress_to_next_level}%`,
                  }}
                />
              </div>
              <div className={styles.homeHskProgressFooter}>
                <p className={styles.homeHskProgressLabel}>{hskProgressLabel}</p>
                {hskLevelStatus.next_level !== null && (
                  <Button
                    kind="cancel"
                    text={t("homePage.hskCard.missingCharactersButton")}
                    onClick={() => setIsMissingModalOpen(true)}
                    className={styles.homeHskMissingButton}
                  />
                )}
              </div>
            </div>
          </section>

          <div className={styles.homeMetrics}>
            <div className={styles.homeMetricCard}>
              <p className={styles.homeMetricValue}>{recognizedCount}</p>
              <p className={styles.homeMetricLabel}>
                {t("homePage.metrics.recognizedLabel")}
              </p>
            </div>
            <div className={styles.homeMetricCard}>
              <p className={styles.homeMetricValue}>{writingCount}</p>
              <p className={styles.homeMetricLabel}>{t("homePage.metrics.writingLabel")}</p>
            </div>
          </div>

          <section className={styles.homeArticleCard} aria-label={t("homePage.article.ariaLabel")}>
            <h2 className={styles.homeArticleTitle}>{t("homePage.article.title")}</h2>
            {isWeeklyArticleLoading && <p>{t("homePage.article.loading")}</p>}
            {weeklyArticleError && (
              <p className="table-error">{weeklyArticleError}</p>
            )}
            {!isWeeklyArticleLoading &&
              !weeklyArticleError &&
              (weeklyArticle?.content && weeklyArticle.content.length > 0 ? (
                <ul className={styles.homeArticleList}>
                  {weeklyArticle.content.map((article, index) => (
                    <li key={index} className={styles.homeArticleItem}>
                      {article.category && article.category.length > 0 && (
                        <ul
                          className={styles.homeArticleCategoryList}
                          aria-label={t("homePage.article.categoriesAriaLabel")}
                        >
                          {article.category.map((category) => (
                            <li
                              key={category}
                              className={styles.homeArticleCategory}
                            >
                              {category}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className={styles.homeArticleItemTitle}>
                        {article.title}
                      </p>
                      <p className={styles.homeArticleContent}>
                        {article.content}
                      </p>
                      {article.pinyin && (
                        <p className={styles.homeArticlePinyin}>
                          {article.pinyin}
                        </p>
                      )}
                      {article.new_words && article.new_words.length > 0 && (
                        <div className={styles.homeArticleNewWords}>
                          <p className={styles.homeArticleNewWordsLabel}>
                            {t("homePage.article.newWordsLabel")}
                          </p>
                          <ul className={styles.homeArticleNewWordsList}>
                            {article.new_words.map((newWord) => (
                              <li
                                key={newWord.word}
                                className={styles.homeArticleNewWord}
                              >
                                <span className={styles.homeArticleNewWordText}>
                                  {newWord.word}
                                </span>
                                <span
                                  className={styles.homeArticleNewWordTranslation}
                                >
                                  {newWord.translation}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.homeArticleEmpty}>
                  {t("homePage.article.empty")}
                </p>
              ))}
          </section>

          {motivationMessages.length > 0 && (
            <ul className={styles.homeMotivationList}>
              {motivationMessages.map((message) => (
                <li key={message} className={styles.homeMotivationItem}>
                  <TrophyIcon className={styles.homeMotivationIcon} />
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          )}

          {isHskInfoOpen && (
            <div className="modal-overlay" onClick={() => setIsHskInfoOpen(false)}>
              <div
                className="modal-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hsk-level-info-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="hsk-level-info-title" className="modal-title">
                  {t("homePage.hskInfoModal.title")}
                </h2>
                <div className={characterWordsStyles.characterWordsModalContent}>
                  <p className="home-hsk-info-text">
                    {t("homePage.hskInfoModal.text", { percent: completionPercent })}
                  </p>
                </div>
                <div className="modal-actions">
                  <Button
                    kind="cancel"
                    text={t("common:actions.close")}
                    onClick={() => setIsHskInfoOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}

          <MissingHskCharactersModal
            isOpen={isMissingModalOpen}
            level={hskLevelStatus.next_level}
            characters={hskLevelStatus.missing_characters}
            onClose={() => setIsMissingModalOpen(false)}
          />
        </>
      )}
    </Page>
  );
}
