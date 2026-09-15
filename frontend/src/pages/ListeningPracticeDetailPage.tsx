import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import manImage from "../assets/listening/man.png";
import womanImage from "../assets/listening/woman.png";
import AudioPlayer from "../components/AudioPlayer";
import Button from "../components/Button";
import { EyeIcon } from "../components/icons";
import ListeningExercises from "../components/ListeningExercises";
import ListeningWritingBonus from "../components/ListeningWritingBonus";
import ShadowingSentence from "../components/ShadowingSentence";
import Page from "../components/Page";
import { useAppDispatch } from "../store/hooks";
import { setListeningPracticeResult } from "../store/slices/listeningSlice";
import type {
  ListeningPracticeDetail,
  ListeningProgressData,
  ListeningSentence,
  ListeningShadowingAnswer,
} from "../types/listeningPractice";
import type { WritingSentenceCheck } from "../types/writingSentence";
import {
  completeListeningPractice,
  fetchListeningAudioBlob,
  fetchListeningAudioSegmentBlob,
  fetchListeningPracticeDetail,
  saveListeningProgress,
} from "../utils/listening/listeningApi";
import styles from "./ListeningPracticeDetailPage.module.css";

type ListeningPracticeDetailPageProps = {
  topicId: string;
  onBack: () => void;
};

// Groups consecutive same-speaker sentences into one "<speaker> : <text>"
// line, so a dialog's translation reads like an actual conversation instead
// of one line per sentence.
function buildDialogTranslation(sentences: ListeningSentence[]): string {
  const lines: string[] = [];
  let speaker: string | null = null;
  let parts: string[] = [];

  function flush() {
    if (parts.length === 0) return;
    const text = parts.join(" ");
    lines.push(speaker ? `${speaker} : ${text}` : text);
  }

  for (const sentence of sentences) {
    if (sentence.speaker !== speaker) {
      flush();
      speaker = sentence.speaker;
      parts = [];
    }
    parts.push(sentence.translation);
  }
  flush();

  return lines.join("\n");
}

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
  const [exercisesAnswers, setExercisesAnswers] = useState<Record<string, number>>({});
  const [shadowingAnswers, setShadowingAnswers] = useState<
    Record<string, ListeningShadowingAnswer>
  >({});
  const [bonusChecks, setBonusChecks] = useState<WritingSentenceCheck[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchListeningPracticeDetail(topicId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setExercisesAnswers(result.progress?.exercises ?? {});
          setShadowingAnswers(result.progress?.shadowing ?? {});
          setBonusChecks(result.progress?.bonus ?? null);
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

  function speakerImageFor(speaker: string) {
    if (!detail) return undefined;
    if (speaker === detail.woman_name) return womanImage;
    if (speaker === detail.man_name) return manImage;
    return undefined;
  }

  function speakerAltFor(speaker: string) {
    if (!detail) return undefined;
    if (speaker === detail.woman_name) {
      return t("listeningPracticeDetailPage.audioSection.womanAlt");
    }
    if (speaker === detail.man_name) {
      return t("listeningPracticeDetailPage.audioSection.manAlt");
    }
    return undefined;
  }

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
                speakerImage: speakerImageFor(sentence.speaker),
                speakerAlt: speakerAltFor(sentence.speaker),
                loadAudio: () =>
                  fetchListeningAudioSegmentBlob(detail.id, sentence.id, chunk.id),
              }))
            : [
                {
                  key: `${sentence.id}`,
                  mandarin: sentence.mandarin,
                  speakerImage: speakerImageFor(sentence.speaker),
                  speakerAlt: speakerAltFor(sentence.speaker),
                  loadAudio: () =>
                    fetchListeningAudioSegmentBlob(detail.id, sentence.id),
                },
              ],
        )
    : [];
  const fullTranslation = detail
    ? detail.type === "dialog"
      ? buildDialogTranslation(detail.sentences)
      : detail.sentences.map((sentence) => sentence.translation).join("\n")
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

  // Saves the whole {exercises, shadowing, bonus} triple on every
  // Verify/Check/Submit click — never on individual keystrokes/selections.
  // Best-effort: a failed save shouldn't surface as a user-facing error.
  function persistProgress(next: ListeningProgressData) {
    if (!detail) return;
    saveListeningProgress(detail.id, next).catch(() => {});
  }

  function handleExercisesVerify(answers: Record<string, number>) {
    setExercisesAnswers(answers);
    persistProgress({ exercises: answers, shadowing: shadowingAnswers, bonus: bonusChecks });
  }

  function handleShadowingCheck(key: string, answer: ListeningShadowingAnswer) {
    const next = { ...shadowingAnswers, [key]: answer };
    setShadowingAnswers(next);
    persistProgress({ exercises: exercisesAnswers, shadowing: next, bonus: bonusChecks });
  }

  function handleBonusProgressChange(sentenceChecks: WritingSentenceCheck[] | null) {
    setBonusChecks(sentenceChecks);
    persistProgress({
      exercises: exercisesAnswers,
      shadowing: shadowingAnswers,
      bonus: sentenceChecks,
    });
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
            {detail.type === "dialog" && (
              <div className={styles.listeningDetailSpeakers}>
                <div className={styles.listeningDetailSpeaker}>
                  <img
                    src={womanImage}
                    alt={t("listeningPracticeDetailPage.audioSection.womanAlt")}
                    className={styles.listeningDetailSpeakerImage}
                  />
                  {detail.woman_name && (
                    <span className={styles.listeningDetailSpeakerName}>
                      {detail.woman_name}
                    </span>
                  )}
                </div>
                <div className={styles.listeningDetailSpeaker}>
                  <img
                    src={manImage}
                    alt={t("listeningPracticeDetailPage.audioSection.manAlt")}
                    className={styles.listeningDetailSpeakerImage}
                  />
                  {detail.man_name && (
                    <span className={styles.listeningDetailSpeakerName}>
                      {detail.man_name}
                    </span>
                  )}
                </div>
              </div>
            )}
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
            <ListeningExercises
              exercises={detail.exercises}
              initialAnswers={detail.progress?.exercises}
              onVerify={handleExercisesVerify}
            />
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
                speakerImage={unit.speakerImage}
                speakerAlt={unit.speakerAlt}
                initialAnswer={detail.progress?.shadowing?.[unit.key]}
                onCheck={(answer) => handleShadowingCheck(unit.key, answer)}
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

          {detail.bonus_question && (
            <section
              className={`${styles.listeningDetailSection} ${styles.listeningDetailBonusSection}`}
            >
              <h2 className={styles.listeningDetailSectionTitle}>
                {t("listeningPracticeDetailPage.bonusWritingSection.title")}
              </h2>
              <p className={styles.listeningDetailSectionInstruction}>
                {t("listeningPracticeDetailPage.bonusWritingSection.instruction")}
              </p>
              <p className={styles.listeningDetailBonusQuestion}>{detail.bonus_question}</p>
              <ListeningWritingBonus
                question={detail.bonus_question}
                initialSentenceChecks={detail.progress?.bonus}
                onProgressChange={handleBonusProgressChange}
              />
            </section>
          )}

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
