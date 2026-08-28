import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TEACHER_WANG } from "../data/chatCharacters";
import type { ChatMessage } from "../types/chat";
import type {
  GrammarExercise,
  SentenceReorderingExercise,
  TransformExercise,
  TranslationExercise,
} from "../types/grammarPoint";
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

function shuffledIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function displayOrderFor(exercise: GrammarExercise | undefined): number[] {
  if (exercise?.type === "multiple_choice") {
    return shuffledIndices(exercise.choices.length);
  }
  if (exercise?.type === "sentence_reordering") {
    return shuffledIndices(exercise.tokens.length);
  }
  return [];
}

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

function scoreMessage(
  t: TFunction,
  percentage: number,
): { text: string; className: string } {
  const band = scoreBand(percentage);
  if (band === "good") {
    return {
      text: t("grammarExercises.score.good", { percentage }),
      className: styles.scoreGood,
    };
  }
  if (band === "medium") {
    return {
      text: t("grammarExercises.score.medium", { percentage }),
      className: styles.scoreMedium,
    };
  }
  return {
    text: t("grammarExercises.score.low", { percentage }),
    className: styles.scoreLow,
  };
}

function gaugeProgressClass(band: ReturnType<typeof scoreBand>): string {
  if (band === "good") return styles.gaugeProgressGood;
  if (band === "medium") return styles.gaugeProgressMedium;
  return styles.gaugeProgressLow;
}

function exerciseQuestionText(exercise: GrammarExercise): string {
  if (exercise.type === "multiple_choice") return exercise.question;
  if (exercise.type === "sentence_reordering") {
    return `put these words in the right order — ${exercise.tokens.join(" / ")}`;
  }
  if (exercise.type === "translation") {
    return `translate into Chinese — "${exercise.prompt}"`;
  }
  return `${exercise.instruction ?? "transform this sentence"} — "${exercise.source}"`;
}

function buildExplanationRequest(
  exercise: GrammarExercise,
  userAnswerText: string,
  correctAnswerText: string,
  grammarPointTitle?: string,
): string {
  const topic = grammarPointTitle ? ` about "${grammarPointTitle}"` : "";

  return (
    `I answered a grammar exercise question wrong${topic}. Question: "${exerciseQuestionText(exercise)}" ` +
    `My answer: "${userAnswerText || "(no answer)"}". ` +
    `The correct answer: "${correctAnswerText}". ` +
    "Can you explain why my answer is wrong and the correct one is right? " +
    "Answer concisely, in English only — use Chinese exclusively for quoting example words or sentences."
  );
}

function buildExplanationDisplayText(
  exercise: GrammarExercise,
  userAnswerText: string,
  correctAnswerText: string,
): string {
  return (
    `**Question**: ${exerciseQuestionText(exercise)}\n` +
    `**Wrong answer**: ${userAnswerText || "(no answer)"}\n` +
    `**Correct answer**: ${correctAnswerText}`
  );
}

function buildAnswerCheckRequest(
  exercise: TranslationExercise | TransformExercise,
  userAnswerText: string,
  grammarPointTitle?: string,
): string {
  const topic = grammarPointTitle ? ` for the grammar point "${grammarPointTitle}"` : "";
  const task =
    exercise.type === "translation"
      ? `translate into Chinese: "${exercise.prompt}"`
      : `${exercise.instruction ?? "transform this sentence"}: "${exercise.source}"`;

  return (
    `I'm practicing a Chinese grammar exercise${topic}. ` +
    `The task was to ${task}. ` +
    `The expected answer is "${exercise.accepted_answers[0]}", but I answered: "${userAnswerText}". ` +
    "Is my answer also a correct, acceptable answer, even if it isn't word-for-word the same? " +
    'Start your reply with exactly "YES" or "NO" as the very first word, then briefly explain why for the student. ' +
    "Keep the explanation concise, in English only — use Chinese exclusively for quoting example words or sentences."
  );
}

function buildReorderCheckRequest(
  exercise: SentenceReorderingExercise,
  userOrderText: string,
  grammarPointTitle?: string,
): string {
  const topic = grammarPointTitle ? ` for the grammar point "${grammarPointTitle}"` : "";

  return (
    `I'm practicing Chinese sentence ordering${topic}. ` +
    `The words to order were: ${exercise.tokens.join(" / ")}. ` +
    `The expected order is "${exercise.answer.join(" ")}", but I answered: "${userOrderText}". ` +
    "Is my order also grammatically correct and natural, even if it isn't the same as the expected order? " +
    'Start your reply with exactly "YES" or "NO" as the very first word, then briefly explain why for the student. ' +
    "Keep the explanation concise, in English only — use Chinese exclusively for quoting example words or sentences."
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
  const { t } = useTranslation("grammar");
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [validated, setValidated] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [displayOrder, setDisplayOrder] = useState<number[]>(() =>
    displayOrderFor(exercises[0]),
  );
  const [orderedIndices, setOrderedIndices] = useState<number[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isCheckingWithAi, setIsCheckingWithAi] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [reorderApprovedByAi, setReorderApprovedByAi] = useState(false);
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
    return <p className={styles.exercisesEmpty}>{t("grammarExercises.empty")}</p>;
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
    setReorderApprovedByAi(false);
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
    if (
      deterministicallyCorrect ||
      (exercise.type !== "translation" && exercise.type !== "transform")
    ) {
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
            content: buildAnswerCheckRequest(exercise, textAnswer, grammarPointTitle),
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
      content:
        exercise.type === "sentence_reordering"
          ? buildReorderCheckRequest(exercise, userAnswerText, grammarPointTitle)
          : buildExplanationRequest(exercise, userAnswerText, correctAnswerText, grammarPointTitle),
      displayContent: buildExplanationDisplayText(
        exercise,
        userAnswerText,
        correctAnswerText,
      ),
    };

    setExplanationMessages(
      aiExplanation
        ? [questionMessage, { role: "assistant", content: aiExplanation }]
        : [questionMessage],
    );
  }

  function handleExplanationThreadChange(threadMessages: ChatMessage[]) {
    if (exercise.type !== "sentence_reordering" || threadMessages.length !== 2) {
      return;
    }
    const reply = threadMessages[1];
    if (reply.role === "assistant" && parseAiApproval(reply.content)) {
      setIsCorrect(true);
      setReorderApprovedByAi(true);
      setCorrectCount((count) => count + 1);
    }
  }

  function next() {
    if (index + 1 >= exercises.length) {
      setFinished(true);
      onFinish?.(Math.round((correctCount / exercises.length) * 100));
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    resetQuestionState();
    setDisplayOrder(displayOrderFor(exercises[nextIndex]));
  }

  function restart() {
    setIndex(0);
    setCorrectCount(0);
    setFinished(false);
    setAnimatedPercentage(0);
    setScoreRevealed(false);
    setShowConfetti(false);
    resetQuestionState();
    setDisplayOrder(displayOrderFor(exercises[0]));
  }

  if (finished) {
    const percentage = Math.round((correctCount / exercises.length) * 100);
    const message = scoreMessage(t, percentage);
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
          <Button
            kind="cancel"
            variant="page"
            text={t("grammarExercises.tryAgainButton")}
            onClick={restart}
          />
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
        {t("grammarExercises.questionProgress", {
          current: index + 1,
          total: exercises.length,
        })}
      </p>

      {exercise.type === "multiple_choice" && (
        <div className={styles.exercisesQuestion}>
          <p>{exercise.question}</p>
          <div className={styles.exercisesChoices}>
            {displayOrder.map((choiceIndex) => {
              const choice = exercise.choices[choiceIndex];
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
          <p>{t("grammarExercises.reorderInstruction")}</p>
          <div className={styles.exercisesAnswerArea}>
            {orderedIndices.length === 0 && (
              <span className={styles.exercisesPlaceholder}>
                {t("grammarExercises.tapWordsBelow")}
              </span>
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
            {displayOrder.map((tokenIndex) => (
              <button
                key={tokenIndex}
                type="button"
                className={styles.exercisesToken}
                disabled={validated || orderedIndices.includes(tokenIndex)}
                onClick={() => setOrderedIndices((indices) => [...indices, tokenIndex])}
              >
                {exercise.tokens[tokenIndex]}
              </button>
            ))}
          </div>
          {validated && !isCorrect && (
            <p className={styles.exercisesCorrectAnswer}>
              {t("grammarExercises.correctOrder", { answer: exercise.answer.join(" ") })}
            </p>
          )}
        </div>
      )}

      {(exercise.type === "translation" || exercise.type === "transform") && (
        <div className={styles.exercisesQuestion}>
          <p className={styles.exercisesInstruction}>
            {exercise.type === "translation"
              ? t("grammarExercises.translateInstruction")
              : (exercise.instruction ?? t("grammarExercises.transformInstruction"))}
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
            placeholder={t("grammarExercises.answerPlaceholder")}
          />
          {validated && !isCorrect && (
            <p className={styles.exercisesCorrectAnswer}>
              {t("grammarExercises.accepted", {
                answers: exercise.accepted_answers.join(" / "),
              })}
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
              ? t("grammarExercises.checkingWithAi")
              : validated
                ? isCorrect
                  ? t("grammarExercises.correct")
                  : t("grammarExercises.notQuite")
                : ""}
          </p>
          {reorderApprovedByAi && (
            <p className={styles.feedbackCorrect}>
              {t("grammarExercises.aiApproved")}
            </p>
          )}
          {validated && !isCorrect && (
            <Button
              kind="cancel"
              variant="page"
              text={t("grammarExercises.moreExplanationButton")}
              onClick={requestExplanation}
            />
          )}
        </div>
        {!validated && (
          <Button
            kind="confirm"
            variant="page"
            text={
              isCheckingWithAi
                ? t("grammarExercises.checkingButton")
                : t("grammarExercises.validateButton")
            }
            disabled={!canValidate || isCheckingWithAi}
            onClick={() => void validate()}
          />
        )}
        {validated && (
          <Button
            kind="confirm"
            variant="page"
            text={
              index + 1 >= exercises.length
                ? t("grammarExercises.seeScoreButton")
                : t("grammarExercises.nextButton")
            }
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
          onThreadMessagesChange={handleExplanationThreadChange}
        />
      )}
    </div>
  );
}
