import { useEffect, useState } from "react";
import { TEACHER_WANG } from "../data/chatCharacters";
import type { ChatMessage } from "../types/chat";
import type { GrammarExercise, TranslationExercise } from "../types/grammarPoint";
import { sendChatMessage } from "../utils/aiChat/chatApi";
import Button from "./Button";
import ChallengeConfetti from "./ChallengeConfetti";
import ChatModal from "./ChatModal";
import styles from "./GrammarExercises.module.css";

const GAUGE_RADIUS = 52;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const GAUGE_ANIMATION_MS = 1100;

type GrammarExercisesProps = {
  exercises: GrammarExercise[];
  grammarPointTitle?: string;
  onFinish?: (percentage: number) => void;
  onProgressChange?: (inProgress: boolean) => void;
};

function normalizeAnswer(value: string): string {
  return value.trim().replace(/[。.!?！？，,]+$/g, "");
}

function isTextAnswerCorrect(value: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(value);
  return accepted.some((candidate) => normalizeAnswer(candidate) === normalized);
}

export function scoreBand(percentage: number): "good" | "medium" | "low" {
  if (percentage >= 80) return "good";
  if (percentage >= 50) return "medium";
  return "low";
}

function scoreMessage(percentage: number): { text: string; className: string } {
  const band = scoreBand(percentage);
  if (band === "good") {
    return {
      text: `You scored ${percentage}%. Great job, you passed this test!`,
      className: styles.scoreGood,
    };
  }
  if (band === "medium") {
    return {
      text: `You scored ${percentage}%. You're on the right track — train on this topic again to raise your score.`,
      className: styles.scoreMedium,
    };
  }
  return {
    text: `You scored ${percentage}%. This grammar point isn't quite settled yet — go back over the explanation, you'll get it!`,
    className: styles.scoreLow,
  };
}

function gaugeProgressClass(band: ReturnType<typeof scoreBand>): string {
  if (band === "good") return styles.gaugeProgressGood;
  if (band === "medium") return styles.gaugeProgressMedium;
  return styles.gaugeProgressLow;
}

function buildExplanationRequest(
  exercise: GrammarExercise,
  userAnswerText: string,
  correctAnswerText: string,
  grammarPointTitle?: string,
): string {
  const questionText =
    exercise.type === "multiple_choice"
      ? `Question: "${exercise.question}"`
      : exercise.type === "sentence_reordering"
        ? `Question: put these words in the right order — ${exercise.tokens.join(" / ")}`
        : exercise.type === "translation"
          ? `Question: translate into Chinese — "${exercise.prompt}"`
          : `Question: ${exercise.instruction ?? "transform this sentence"} — "${exercise.source}"`;

  const topic = grammarPointTitle ? ` about "${grammarPointTitle}"` : "";

  return (
    `I answered a grammar exercise question wrong${topic}. ${questionText} ` +
    `My answer: "${userAnswerText || "(no answer)"}". ` +
    `The correct answer: "${correctAnswerText}". ` +
    "Can you explain why my answer is wrong and the correct one is right?"
  );
}

function buildTranslationCheckRequest(
  exercise: TranslationExercise,
  userAnswerText: string,
  grammarPointTitle?: string,
): string {
  const topic = grammarPointTitle ? ` for the grammar point "${grammarPointTitle}"` : "";

  return (
    `I'm practicing a Chinese translation exercise${topic}. ` +
    `The sentence to translate was: "${exercise.prompt}". ` +
    `The expected answer is "${exercise.accepted_answers[0]}", but I answered: "${userAnswerText}". ` +
    "Is my answer also a correct, acceptable translation, even if it isn't word-for-word the same? " +
    'Start your reply with exactly "YES" or "NO" as the very first word, then briefly explain why for the student.'
  );
}

function parseAiApproval(content: string): boolean {
  return content.trim().replace(/^[^a-zA-Z]+/, "").toLowerCase().startsWith("yes");
}

export default function GrammarExercises({
  exercises,
  grammarPointTitle,
  onFinish,
  onProgressChange,
}: GrammarExercisesProps) {
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [validated, setValidated] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [orderedIndices, setOrderedIndices] = useState<number[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isCheckingWithAi, setIsCheckingWithAi] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [explanationMessages, setExplanationMessages] = useState<
    ChatMessage[] | null
  >(null);

  const inProgress =
    !finished &&
    (index > 0 ||
      validated ||
      selectedChoice !== null ||
      orderedIndices.length > 0 ||
      textAnswer.trim().length > 0);

  useEffect(() => {
    onProgressChange?.(inProgress);
  }, [inProgress, onProgressChange]);

  useEffect(() => () => onProgressChange?.(false), []);

  useEffect(() => {
    if (!finished || exercises.length === 0) return;
    const percentage = Math.round((correctCount / exercises.length) * 100);
    setAnimatedPercentage(0);
    setScoreRevealed(false);
    const raf = requestAnimationFrame(() => setAnimatedPercentage(percentage));
    const revealTimer = setTimeout(() => {
      setScoreRevealed(true);
      if (scoreBand(percentage) === "good") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
      }
    }, GAUGE_ANIMATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(revealTimer);
    };
  }, [finished, correctCount, exercises.length]);

  if (exercises.length === 0) {
    return <p className={styles.exercisesEmpty}>No exercises available yet.</p>;
  }

  const exercise = exercises[index];

  function resetQuestionState() {
    setValidated(false);
    setIsCorrect(false);
    setSelectedChoice(null);
    setOrderedIndices([]);
    setTextAnswer("");
    setIsCheckingWithAi(false);
    setAiExplanation(null);
  }

  async function validate() {
    if (exercise.type === "multiple_choice") {
      const correct = selectedChoice === exercise.answer;
      setIsCorrect(correct);
      setValidated(true);
      if (correct) setCorrectCount((count) => count + 1);
      return;
    }

    if (exercise.type === "sentence_reordering") {
      const orderedTokens = orderedIndices.map((i) => exercise.tokens[i]);
      const correct =
        orderedTokens.length === exercise.answer.length &&
        orderedTokens.every((token, i) => token === exercise.answer[i]);
      setIsCorrect(correct);
      setValidated(true);
      if (correct) setCorrectCount((count) => count + 1);
      return;
    }

    const deterministicallyCorrect = isTextAnswerCorrect(
      textAnswer,
      exercise.accepted_answers,
    );
    if (deterministicallyCorrect || exercise.type !== "translation") {
      setIsCorrect(deterministicallyCorrect);
      setValidated(true);
      if (deterministicallyCorrect) setCorrectCount((count) => count + 1);
      return;
    }

    setIsCheckingWithAi(true);
    try {
      const response = await sendChatMessage(
        TEACHER_WANG.id,
        [
          {
            role: "user",
            content: buildTranslationCheckRequest(exercise, textAnswer, grammarPointTitle),
          },
        ],
        undefined,
        true,
      );
      const approved = parseAiApproval(response.message.content);
      setIsCorrect(approved);
      if (approved) {
        setCorrectCount((count) => count + 1);
      } else {
        setAiExplanation(response.message.content);
      }
    } catch {
      setIsCorrect(false);
    } finally {
      setIsCheckingWithAi(false);
      setValidated(true);
    }
  }

  function requestExplanation() {
    const userAnswerText =
      exercise.type === "multiple_choice"
        ? (selectedChoice !== null ? exercise.choices[selectedChoice] : "")
        : exercise.type === "sentence_reordering"
          ? orderedIndices.map((i) => exercise.tokens[i]).join(" ")
          : textAnswer;
    const correctAnswerText =
      exercise.type === "multiple_choice"
        ? exercise.choices[exercise.answer]
        : exercise.type === "sentence_reordering"
          ? exercise.answer.join(" ")
          : exercise.accepted_answers[0];

    const questionMessage: ChatMessage = {
      role: "user",
      isContext: true,
      content: buildExplanationRequest(
        exercise,
        userAnswerText,
        correctAnswerText,
        grammarPointTitle,
      ),
    };

    setExplanationMessages(
      aiExplanation
        ? [questionMessage, { role: "assistant", content: aiExplanation }]
        : [questionMessage],
    );
  }

  function next() {
    if (index + 1 >= exercises.length) {
      setFinished(true);
      onFinish?.(Math.round((correctCount / exercises.length) * 100));
      return;
    }
    setIndex((i) => i + 1);
    resetQuestionState();
  }

  function restart() {
    setIndex(0);
    setCorrectCount(0);
    setFinished(false);
    setAnimatedPercentage(0);
    setScoreRevealed(false);
    setShowConfetti(false);
    resetQuestionState();
  }

  if (finished) {
    const percentage = Math.round((correctCount / exercises.length) * 100);
    const message = scoreMessage(percentage);
    const gaugeOffset =
      GAUGE_CIRCUMFERENCE - (animatedPercentage / 100) * GAUGE_CIRCUMFERENCE;

    return (
      <div className={styles.exercisesScore}>
        <ChallengeConfetti active={showConfetti} />
        <div className={styles.gaugeWrap}>
          <svg viewBox="0 0 120 120" className={styles.gauge}>
            <circle cx="60" cy="60" r={GAUGE_RADIUS} className={styles.gaugeTrack} />
            <circle
              cx="60"
              cy="60"
              r={GAUGE_RADIUS}
              className={gaugeProgressClass(scoreBand(percentage))}
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={gaugeOffset}
            />
          </svg>
          <span className={styles.gaugeText}>{animatedPercentage}%</span>
        </div>
        <div className={scoreRevealed ? styles.scoreReveal : styles.scoreRevealHidden}>
          <p className={message.className}>{message.text}</p>
          <Button kind="cancel" variant="page" text="Try again" onClick={restart} />
        </div>
      </div>
    );
  }

  const canValidate =
    exercise.type === "multiple_choice"
      ? selectedChoice !== null
      : exercise.type === "sentence_reordering"
        ? orderedIndices.length === exercise.tokens.length
        : textAnswer.trim().length > 0;

  return (
    <div className={styles.exercises}>
      <p className={styles.exercisesProgress}>
        Question {index + 1} of {exercises.length}
      </p>

      {exercise.type === "multiple_choice" && (
        <div className={styles.exercisesQuestion}>
          <p>{exercise.question}</p>
          <div className={styles.exercisesChoices}>
            {exercise.choices.map((choice, choiceIndex) => {
              const isSelected = selectedChoice === choiceIndex;
              const isAnswer = choiceIndex === exercise.answer;
              let stateClass = "";
              if (validated && isAnswer) {
                stateClass = styles.choiceCorrect;
              } else if (validated && isSelected && !isAnswer) {
                stateClass = styles.choiceIncorrect;
              } else if (isSelected) {
                stateClass = styles.choiceSelected;
              }
              return (
                <button
                  key={choiceIndex}
                  type="button"
                  className={`${styles.exercisesChoice} ${stateClass}`}
                  disabled={validated}
                  onClick={() => setSelectedChoice(choiceIndex)}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {exercise.type === "sentence_reordering" && (
        <div className={styles.exercisesQuestion}>
          <p>Put the words in the right order.</p>
          <div className={styles.exercisesAnswerArea}>
            {orderedIndices.length === 0 && (
              <span className={styles.exercisesPlaceholder}>Tap the words below</span>
            )}
            {orderedIndices.map((tokenIndex, position) => (
              <button
                key={position}
                type="button"
                className={styles.exercisesToken}
                disabled={validated}
                onClick={() =>
                  setOrderedIndices((indices) => indices.filter((_, i) => i !== position))
                }
              >
                {exercise.tokens[tokenIndex]}
              </button>
            ))}
          </div>
          <div className={styles.exercisesChoices}>
            {exercise.tokens.map((token, tokenIndex) => (
              <button
                key={tokenIndex}
                type="button"
                className={styles.exercisesToken}
                disabled={validated || orderedIndices.includes(tokenIndex)}
                onClick={() => setOrderedIndices((indices) => [...indices, tokenIndex])}
              >
                {token}
              </button>
            ))}
          </div>
          {validated && !isCorrect && (
            <p className={styles.exercisesCorrectAnswer}>
              Correct order: {exercise.answer.join(" ")}
            </p>
          )}
        </div>
      )}

      {(exercise.type === "translation" || exercise.type === "transform") && (
        <div className={styles.exercisesQuestion}>
          <p className={styles.exercisesInstruction}>
            {exercise.type === "translation"
              ? "Translate the following sentence into Chinese:"
              : (exercise.instruction ?? "Transform the following sentence:")}
          </p>
          <p className={styles.exercisesSource}>
            {exercise.type === "translation" ? exercise.prompt : exercise.source}
          </p>
          <input
            type="text"
            className={styles.exercisesInput}
            value={textAnswer}
            disabled={validated || isCheckingWithAi}
            onChange={(event) => setTextAnswer(event.target.value)}
            placeholder="Type your answer"
          />
          {validated && !isCorrect && (
            <p className={styles.exercisesCorrectAnswer}>
              Accepted: {exercise.accepted_answers.join(" / ")}
            </p>
          )}
        </div>
      )}

      <div className={styles.exercisesFooter}>
        <div className={styles.exercisesFeedback}>
          <p
            className={
              isCheckingWithAi
                ? styles.exercisesInstruction
                : isCorrect
                  ? styles.feedbackCorrect
                  : styles.feedbackIncorrect
            }
          >
            {isCheckingWithAi
              ? "This solution is not the expected one. Checking with Teacher Wang if it is a possible solution. Please wait..."
              : validated
                ? isCorrect
                  ? "Correct!"
                  : "Not quite."
                : ""}
          </p>
          {validated && !isCorrect && (
            <Button
              kind="cancel"
              variant="page"
              text="More explanation"
              onClick={requestExplanation}
            />
          )}
        </div>
        {!validated && (
          <Button
            kind="confirm"
            variant="page"
            text={isCheckingWithAi ? "Checking..." : "Validate"}
            disabled={!canValidate || isCheckingWithAi}
            onClick={() => void validate()}
          />
        )}
        {validated && (
          <Button
            kind="confirm"
            variant="page"
            text={index + 1 >= exercises.length ? "See score" : "Next"}
            onClick={next}
          />
        )}
      </div>
      {explanationMessages && (
        <ChatModal
          character={TEACHER_WANG}
          onClose={() => setExplanationMessages(null)}
          initialMessages={explanationMessages}
          loadHistory={false}
          allowClearHistory={false}
          ephemeral
          autoSendInitialMessage
        />
      )}
    </div>
  );
}
