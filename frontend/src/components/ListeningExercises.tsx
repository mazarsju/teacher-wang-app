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
  onVerified: (score: number) => void;
};

export default function ListeningExercises({
  exercises,
  onVerified,
}: ListeningExercisesProps) {
  const { t } = useTranslation("listening");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isVerified, setIsVerified] = useState(false);
  const [score, setScore] = useState<number | null>(null);
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
    const correctCount = exercises.filter(
      (exercise) => answers[exercise.id] === exercise.answer,
    ).length;
    const percentage = Math.round((correctCount / exercises.length) * 100);
    setScore(percentage);
    setIsVerified(true);
    if (percentage >= PASSING_SCORE) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), CONFETTI_DURATION_MS);
    }
    onVerified(percentage);
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
