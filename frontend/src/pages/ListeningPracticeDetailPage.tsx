import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AudioPlayer from "../components/AudioPlayer";
import Button from "../components/Button";
import { EyeIcon } from "../components/icons";
import ShadowingSentence from "../components/ShadowingSentence";
import Page from "../components/Page";
import type { ListeningPracticeDetail } from "../types/listeningPractice";
import {
  fetchListeningAudioBlob,
  fetchListeningPracticeDetail,
} from "../utils/listening/listeningApi";
import styles from "./ListeningPracticeDetailPage.module.css";

type ListeningPracticeDetailPageProps = {
  topicId: string;
  onBack: () => void;
};

export default function ListeningPracticeDetailPage({
  topicId,
  onBack,
}: ListeningPracticeDetailPageProps) {
  const { t } = useTranslation("listening");
  const [detail, setDetail] = useState<ListeningPracticeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTextRevealed, setIsTextRevealed] = useState(false);
  const [isTranslationShown, setIsTranslationShown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchListeningPracticeDetail(topicId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t("listeningPracticeDetailPage.loadError"),
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
  }, [topicId, t]);

  const shadowingCount = detail
    ? Math.min(detail.sentences.length, detail.segment_count)
    : 0;
  const fullTranslation = detail
    ? detail.sentences.map((sentence) => sentence.translation).join("\n")
    : "";

  return (
    <Page
      title={detail?.title ?? t("listeningPracticeDetailPage.title")}
      headerAction={
        <Button
          kind="cancel"
          variant="page"
          text={t("listeningPracticeDetailPage.back")}
          onClick={onBack}
        />
      }
    >
      {isLoading && <p>{t("listeningPracticeDetailPage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && detail && (
        <>
          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.audioSection.title")}
            </h2>
            <AudioPlayer
              loadAudio={() => fetchListeningAudioBlob(detail.id)}
              showSkipButtons
            />
          </section>

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.questionsSection.title")}
            </h2>
            <p>{t("listeningPracticeDetailPage.questionsSection.comingSoon")}</p>
          </section>

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.shadowingSection.title")}
            </h2>
            {Array.from({ length: shadowingCount }, (_, index) => (
              <ShadowingSentence
                key={detail.sentences[index].id}
                topicId={detail.id}
                segment={index + 1}
                sentence={detail.sentences[index]}
              />
            ))}
          </section>

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.textSection.title")}
            </h2>
            <div className={styles.listeningDetailTextWrap}>
              <span
                className={
                  isTextRevealed
                    ? styles.listeningDetailText
                    : `${styles.listeningDetailText} ${styles.listeningDetailTextBlurred}`
                }
              >
                {detail.text}
              </span>
              <button
                type="button"
                className={styles.listeningDetailRevealButton}
                onClick={() => setIsTextRevealed((current) => !current)}
                aria-label={t("listeningPracticeDetailPage.textSection.reveal")}
              >
                <EyeIcon className={styles.listeningDetailRevealIcon} />
              </button>
            </div>
            <Button
              kind="cancel"
              variant="page"
              text={t("listeningPracticeDetailPage.textSection.showTranslation")}
              onClick={() => setIsTranslationShown(true)}
            />
            {isTranslationShown && (
              <p className={styles.listeningDetailTranslation}>
                {fullTranslation}
              </p>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
