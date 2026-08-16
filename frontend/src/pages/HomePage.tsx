import { useCallback, useEffect, useMemo, useState } from "react";
import Banner from "../components/Banner";
import KnowledgeBaseInitWizardModal from "../components/KnowledgeBaseInitWizardModal";
import MissingHskCharactersModal from "../components/MissingHskCharactersModal";
import type { PageId } from "../components/Navbar";
import { InfoIcon, TrophyIcon } from "../components/icons";
import Page from "../components/Page";
import { useAppSelector } from "../store/hooks";
import { getMotivationMessages } from "../utils/knowledgeBase/homeMotivation";
import {
  fetchWeeklyArticle,
  type WeeklyArticle,
} from "../utils/knowledgeBase/weeklyArticleApi";
import Button from "../components/Button";
import characterWordsStyles from "../components/CharacterWordsModal.module.css";
import styles from "./HomePage.module.css";

const ONBOARDING_WORD_THRESHOLD = 10;

type HomePageProps = { onNavigate?: (page: PageId) => void };

export default function HomePage({ onNavigate }: HomePageProps) {
  const characters = useAppSelector((state) => state.characters.items);
  const words = useAppSelector((state) => state.words.items);
  const hskLevelStatus = useAppSelector((state) => state.hsk.status);
  const syncStatus = useAppSelector((state) => state.sync.status);
  const syncError = useAppSelector((state) => state.sync.error);
  const lastSyncedAt = useAppSelector((state) => state.sync.lastSyncedAt);
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [isHskInfoOpen, setIsHskInfoOpen] = useState(false);
  const [isInitWizardOpen, setIsInitWizardOpen] = useState(false);
  const [weeklyArticle, setWeeklyArticle] = useState<WeeklyArticle | null>(null);
  const [isWeeklyArticleLoading, setIsWeeklyArticleLoading] = useState(true);
  const [weeklyArticleError, setWeeklyArticleError] = useState<string | null>(
    null,
  );

  const loadWeeklyArticle = useCallback(async () => {
    setWeeklyArticleError(null);
    try {
      setWeeklyArticle(await fetchWeeklyArticle());
    } catch (loadError) {
      setWeeklyArticleError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load your weekly articles.",
      );
    } finally {
      setIsWeeklyArticleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeeklyArticle();
  }, [loadWeeklyArticle]);

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
        ? "Your HSK journey starts here"
        : hskLevelStatus.current_level === hskLevelStatus.max_level
          ? `You've reached the top — HSK ${hskLevelStatus.max_level}!`
          : `You're at HSK ${hskLevelStatus.current_level}!`;

  const hskProgressLabel =
    hskLevelStatus === null
      ? ""
      : hskLevelStatus.next_level === null
        ? "Maximum HSK level reached. Outstanding work!"
        : `${hskLevelStatus.characters_to_next_level} ${
            hskLevelStatus.characters_to_next_level === 1
              ? "character"
              : "characters"
          } to reach HSK ${hskLevelStatus.next_level}`;

  const completionPercent =
    hskLevelStatus === null
      ? 0
      : Math.round(hskLevelStatus.completion_ratio * 100);

  return (
    <Page title="Home">
      {words.length < ONBOARDING_WORD_THRESHOLD && (
        <Banner
          type="info"
          message="Struggling with setting up your knowledge base? Click here for a faster and easier onboarding!"
          buttonMessage="Start building your knowledge base"
          actionOnButtonClick={() => setIsInitWizardOpen(true)}
        />
      )}
      <KnowledgeBaseInitWizardModal
        isOpen={isInitWizardOpen}
        onClose={() => setIsInitWizardOpen(false)}
        onNavigate={onNavigate}
      />
      {isLoading && <p>Loading your progress...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && hskLevelStatus !== null && (
        <>
          <section className={styles.homeHskCard} aria-label="HSK level">
            <div className={styles.homeHskBadge}>
              <span className={styles.homeHskBadgeLabel}>HSK</span>
              <span className={styles.homeHskBadgeLevel}>
                {hskLevelStatus.current_level ?? "—"}
              </span>
            </div>
            <div className={styles.homeHskContent}>
              <div className={styles.homeHskTitleRow}>
                <p className={styles.homeHskTitle}>{hskTitle}</p>
                <button
                  type="button"
                  className="home-hsk-info-button"
                  aria-label="How HSK level is estimated"
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
                aria-label="Progress to next HSK level"
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
                    text="Missing characters"
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
                Characters you are able to recognize
              </p>
            </div>
            <div className={styles.homeMetricCard}>
              <p className={styles.homeMetricValue}>{writingCount}</p>
              <p className={styles.homeMetricLabel}>Characters you can write</p>
            </div>
          </div>

          <section className={styles.homeArticleCard} aria-label="Your weekly articles">
            <h2 className={styles.homeArticleTitle}>Your weekly articles</h2>
            {isWeeklyArticleLoading && <p>Loading this week's articles...</p>}
            {weeklyArticleError && (
              <p className="table-error">{weeklyArticleError}</p>
            )}
            {!isWeeklyArticleLoading &&
              !weeklyArticleError &&
              (weeklyArticle?.content && weeklyArticle.content.length > 0 ? (
                <ul className={styles.homeArticleList}>
                  {weeklyArticle.content.map((article, index) => (
                    <li key={index} className={styles.homeArticleItem}>
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
                            New words
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
                  No articles for this week yet — check back soon.
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
                  How HSK level is estimated
                </h2>
                <div className={characterWordsStyles.characterWordsModalContent}>
                  <p className="home-hsk-info-text">
                    This HSK level is an estimate based on the characters you know.
                    A level counts as reached when you know at least{" "}
                    {completionPercent}% of all characters expected up to that
                    level — for example, HSK 3 needs {completionPercent}% of HSK
                    1, 2, and 3 combined. The missing-characters list includes gaps
                    from earlier levels too, so you can fill those first. Less
                    useful characters can wait while you learn more frequent ones.
                  </p>
                </div>
                <div className="modal-actions">
                  <Button
                    kind="cancel"
                    text="Close"
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
