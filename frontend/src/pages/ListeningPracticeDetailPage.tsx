import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AudioPlayer from "../components/AudioPlayer";
import Button from "../components/Button";
import { EyeIcon } from "../components/icons";
import ListeningExercises from "../components/ListeningExercises";
import ShadowingSentence from "../components/ShadowingSentence";
import Page from "../components/Page";
import { useAppDispatch } from "../store/hooks";
import { setListeningPracticeResult } from "../store/slices/listeningSlice";
import type { ListeningPracticeDetail } from "../types/listeningPractice";
import {
  completeListeningPractice,
  fetchListeningAudioBlob,
  fetchListeningAudioSegmentBlob,
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
  const dispatch = useAppDispatch();
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

  const shadowingUnits = detail
    ? detail.sentences
        .filter(
          (sentence, index) =>
            (sentence.chunks?.length ?? 0) > 0 || index < detail.segment_count,
        )
        .flatMap((sentence) =>
          sentence.chunks && sentence.chunks.length > 0
            ? sentence.chunks.map((chunk) => ({
                key: `${sentence.id}-${chunk.id}`,
                mandarin: chunk.mandarin,
                loadAudio: () =>
                  fetchListeningAudioSegmentBlob(detail.id, sentence.id, chunk.id),
              }))
            : [
                {
                  key: `${sentence.id}`,
                  mandarin: sentence.mandarin,
                  loadAudio: () =>
                    fetchListeningAudioSegmentBlob(detail.id, sentence.id),
                },
              ],
        )
    : [];
  const fullTranslation = detail
    ? detail.sentences.map((sentence) => sentence.translation).join("\n")
    : "";

  function handleCompletionChoice(completed: boolean) {
    if (!detail) {
      return;
    }
    completeListeningPractice(detail.id, completed)
      .then((result) => {
        setDetail((current) =>
          current
            ? {
                ...current,
                status: result.status,
                vocabulary_score: result.vocabulary_score,
                grammar_score: result.grammar_score,
              }
            : current,
        );
        dispatch(
          setListeningPracticeResult({
            id: detail.id,
            status: result.status,
            vocabulary_score: result.vocabulary_score,
            grammar_score: result.grammar_score,
          }),
        );
      })
      .catch(() => {});
  }

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
            <p className={styles.listeningDetailSectionInstruction}>
              {t("listeningPracticeDetailPage.audioSection.instruction")}
            </p>
            <AudioPlayer
              loadAudio={() => fetchListeningAudioBlob(detail.id)}
              showSkipButtons
            />
          </section>

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.questionsSection.title")}
            </h2>
            <p className={styles.listeningDetailSectionInstruction}>
              {t("listeningPracticeDetailPage.questionsSection.instruction")}
            </p>
            <ListeningExercises exercises={detail.exercises} />
          </section>

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.shadowingSection.title")}
            </h2>
            <p className={styles.listeningDetailSectionInstruction}>
              {t("listeningPracticeDetailPage.shadowingSection.instruction")}
            </p>
            {shadowingUnits.map((unit) => (
              <ShadowingSentence
                key={unit.key}
                mandarin={unit.mandarin}
                loadAudio={unit.loadAudio}
              />
            ))}
          </section>

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.textSection.title")}
            </h2>
            <p className={styles.listeningDetailSectionInstruction}>
              {t("listeningPracticeDetailPage.textSection.instruction")}
            </p>
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

          <section className={styles.listeningDetailSection}>
            <h2 className={styles.listeningDetailSectionTitle}>
              {t("listeningPracticeDetailPage.completionSection.title")}
            </h2>
            <p className={styles.listeningDetailSectionInstruction}>
              {t("listeningPracticeDetailPage.completionSection.question")}
            </p>
            <div className={styles.listeningDetailCompletionActions}>
              <Button
                kind="confirm"
                variant="page"
                text={t("listeningPracticeDetailPage.completionSection.yes")}
                onClick={() => handleCompletionChoice(true)}
              />
              <Button
                kind="cancel"
                variant="page"
                text={t("listeningPracticeDetailPage.completionSection.no")}
                onClick={() => handleCompletionChoice(false)}
              />
            </div>
            {detail.status === "DONE" && (
              <p className={styles.listeningDetailSectionInstruction}>
                {t("listeningPracticeDetailPage.completionSection.markedDone")}
              </p>
            )}
            {detail.status === "WIP" && (
              <p className={styles.listeningDetailSectionInstruction}>
                {t(
                  "listeningPracticeDetailPage.completionSection.markedNotDone",
                )}
              </p>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
