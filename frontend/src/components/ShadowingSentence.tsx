import { useState } from "react";
import { useTranslation } from "react-i18next";
import AudioPlayer from "./AudioPlayer";
import Button from "./Button";
import { CheckIcon, EyeIcon, IncorrectIcon, MicrophoneIcon } from "./icons";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { transcribeListeningAudio } from "../utils/listening/listeningApi";
import {
  diffSentenceChars,
  matchesSentence,
} from "../utils/listening/matchesSentence";
import styles from "./ShadowingSentence.module.css";

type ShadowingSentenceProps = {
  mandarin: string;
  loadAudio: () => Promise<Blob>;
};

export default function ShadowingSentence({
  mandarin,
  loadAudio,
}: ShadowingSentenceProps) {
  const { t } = useTranslation("listening");
  const [isRevealed, setIsRevealed] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [checkResult, setCheckResult] = useState<
    "correct" | "incorrect" | null
  >(null);
  const {
    phase: voicePhase,
    error: voiceError,
    pressHandlers: voicePressHandlers,
  } = useVoiceInput(transcribeListeningAudio, (text) => {
    setInputValue((current) => current + text);
    setCheckResult(null);
  });

  return (
    <div className={styles.shadowingSentence}>
      <AudioPlayer loadAudio={loadAudio} />
      <div className={styles.shadowingSentenceTextWrap}>
        <span
          className={
            isRevealed
              ? styles.shadowingSentenceText
              : `${styles.shadowingSentenceText} ${styles.shadowingSentenceTextBlurred}`
          }
        >
          {checkResult === "correct" ? (
            <span className={styles.shadowingSentenceCharCorrect}>
              {mandarin}
            </span>
          ) : checkResult === "incorrect" ? (
            diffSentenceChars(inputValue, mandarin).map((entry, index) => (
              <span
                key={index}
                className={
                  entry.matched === null
                    ? undefined
                    : entry.matched
                      ? styles.shadowingSentenceCharCorrect
                      : styles.shadowingSentenceCharIncorrect
                }
              >
                {entry.char}
              </span>
            ))
          ) : (
            mandarin
          )}
        </span>
        <button
          type="button"
          className={styles.shadowingSentenceRevealButton}
          onClick={() => setIsRevealed((current) => !current)}
          aria-label={t("shadowingSentence.reveal")}
        >
          <EyeIcon className={styles.shadowingSentenceRevealIcon} />
        </button>
      </div>
      <div className={styles.shadowingSentenceInputRow}>
        <input
          type="text"
          className={styles.shadowingSentenceInput}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            setCheckResult(null);
          }}
          placeholder={
            voicePhase === "processing"
              ? t("shadowingSentence.transcribing")
              : t("shadowingSentence.inputPlaceholder")
          }
          disabled={voicePhase === "processing"}
        />
        <button
          type="button"
          className={`${styles.shadowingSentenceMicButton} ${
            voicePhase === "recording"
              ? styles.shadowingSentenceMicButtonActive
              : voicePhase === "processing"
                ? styles.shadowingSentenceMicButtonProcessing
                : ""
          }`}
          disabled={voicePhase === "processing"}
          aria-label={
            voicePhase === "recording"
              ? t("shadowingSentence.recording")
              : voicePhase === "processing"
                ? t("shadowingSentence.transcribing")
                : t("shadowingSentence.record")
          }
          {...voicePressHandlers}
        >
          <MicrophoneIcon className={styles.shadowingSentenceMicIcon} />
        </button>
        <Button
          kind="confirm"
          variant="table"
          text={t("shadowingSentence.check")}
          disabled={!inputValue.trim()}
          onClick={() =>
            setCheckResult(
              matchesSentence(inputValue, mandarin) ? "correct" : "incorrect",
            )
          }
        />
        {checkResult === "correct" && (
          <CheckIcon
            className={`${styles.shadowingSentenceResultIcon} ${styles.shadowingSentenceResultIconCorrect}`}
          />
        )}
        {checkResult === "incorrect" && (
          <IncorrectIcon
            className={`${styles.shadowingSentenceResultIcon} ${styles.shadowingSentenceResultIconIncorrect}`}
          />
        )}
      </div>
      {voiceError && <p className={styles.shadowingSentenceError}>{voiceError}</p>}
    </div>
  );
}
