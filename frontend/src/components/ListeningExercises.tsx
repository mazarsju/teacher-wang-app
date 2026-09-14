import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import ChallengeConfetti from "./ChallengeConfetti";
import type { ListeningExercise } from "../types/listeningPractice";
import styles from "./ListeningExercises.module.css";

const PASSING_SCORE = 80;
const CONFETTI_DURATION_MS = 2000;

type ListeningExercisesProps = {
  exercises: ListeningExercise[];
  initialAnswers?: Record<string, number>;
  onVerify?: (answers: Record<string, number>) => void;
};

function computeScore(
  exercises: ListeningExercise[],
  answers: Record<string, number>,
): number {
  const correctCount = exercises.filter(
    (exercise) => answers[exercise.id] === exercise.answer,
  ).length;
  return Math.round((correctCount / exercises.length) * 100);
}

export default function ListeningExercises({
  exercises,
  initialAnswers,
  onVerify,
}: ListeningExercisesProps) {
  const { t } = useTranslation("listening");
  const [answers, setAnswers] = useState<Record<string, number>>(initialAnswers ?? {});
  // Restoring a previously fully-answered attempt shows it already verified,
  // as if Verify had just been clicked, instead of losing that feedback.
  const wasFullyVerified =
    exercises.length > 0 &&
    exercises.every((exercise) => (initialAnswers ?? {})[exercise.id] !== undefined);
  const [isVerified, setIsVerified] = useState(wasFullyVerified);
  const [score, setScore] = useState<number | null>(
    wasFullyVerified ? computeScore(exercises, initialAnswers ?? {}) : null,
  );
  const [showConfetti, setShowConfetti] = useState(false);

  if (exercises.length === 0) {
    return <p>{t("listeningExercises.empty")}</p>;
  }

  const allAnswered = exercises.every(
    (exercise) => answers[exercise.id] !== undefined,
  );

  function selectChoice(exerciseId: string, choiceIndex: number) {
    setAnswers((current) => ({ ...current, [exerciseId]: choiceIndex }));
    setIsVerified(false);
  }

  function handleVerify() {
    const percentage = computeScore(exercises, answers);
    setScore(percentage);
    setIsVerified(true);
    onVerify?.(answers);
    if (percentage >= PASSING_SCORE) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), CONFETTI_DURATION_MS);
    }
  }

  return (
    <div className={styles.listeningExercises}>
      {exercises.map((exercise, exerciseIndex) => {
        const selected = answers[exercise.id];
        return (
          <div key={exercise.id} className={styles.listeningExercise}>
            <p className={styles.listeningExerciseQuestion}>
              {t("listeningExercises.questionNumber", {
                number: exerciseIndex + 1,
              })}{" "}
              {exercise.question}
            </p>
            <div className={styles.listeningExerciseChoices}>
              {exercise.choices.map((choice, choiceIndex) => {
                const isSelected = selected === choiceIndex;
                const isCorrectChoice = choiceIndex === exercise.answer;
                let modifier = "";
                if (isVerified) {
                  modifier = isCorrectChoice
                    ? styles.listeningExerciseChoiceCorrect
                    : isSelected
                      ? styles.listeningExerciseChoiceIncorrect
                      : "";
                } else if (isSelected) {
                  modifier = styles.listeningExerciseChoiceSelected;
                }
                return (
                  <button
                    key={choiceIndex}
                    type="button"
                    className={`${styles.listeningExerciseChoice} ${modifier}`}
                    aria-pressed={isSelected}
                    onClick={() => selectChoice(exercise.id, choiceIndex)}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className={styles.listeningExercisesFooter}>
        <Button
          kind="confirm"
          variant="page"
          text={t("listeningExercises.verify")}
          disabled={!allAnswered}
          onClick={handleVerify}
        />
        {isVerified && score !== null && (
          <p
            className={
              score >= PASSING_SCORE
                ? styles.listeningExercisesScorePass
                : styles.listeningExercisesScoreFail
            }
          >
            <span>{t("listeningExercises.scoreResult", { score })}</span>{" "}
            <span>
              {score >= PASSING_SCORE
                ? t("listeningExercises.passed")
                : t("listeningExercises.failed")}
            </span>
          </p>
        )}
      </div>
      <ChallengeConfetti active={showConfetti} />
    </div>
  );
}
