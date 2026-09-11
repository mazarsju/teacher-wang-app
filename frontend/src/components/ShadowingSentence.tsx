import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AudioPlayer from "./AudioPlayer";
import Button from "./Button";
import { CheckIcon, EyeIcon, IncorrectIcon, MicrophoneIcon } from "./icons";
import type { ListeningSentence } from "../types/listeningPractice";
import {
  fetchListeningAudioSegmentBlob,
  transcribeListeningAudio,
} from "../utils/listening/listeningApi";
import { matchesSentence } from "../utils/listening/matchesSentence";
import styles from "./ShadowingSentence.module.css";

type ShadowingSentenceProps = {
  topicId: string;
  segment: number;
  sentence: ListeningSentence;
};

export default function ShadowingSentence({
  topicId,
  segment,
  sentence,
}: ShadowingSentenceProps) {
  const { t } = useTranslation("listening");
  const [isRevealed, setIsRevealed] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [checkResult, setCheckResult] = useState<
    "correct" | "incorrect" | null
  >(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    setIsRecording(false);
    recorder.onstop = () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });
      setIsTranscribing(true);
      transcribeListeningAudio(audioBlob)
        .then((text) => {
          setInputValue(text);
          setCheckResult(null);
        })
        .catch(() => {})
        .finally(() => setIsTranscribing(false));
    };
    recorder.stop();
  }

  return (
    <div className={styles.shadowingSentence}>
      <AudioPlayer
        loadAudio={() => fetchListeningAudioSegmentBlob(topicId, segment)}
      />
      <div className={styles.shadowingSentenceTextWrap}>
        <span
          className={
            isRevealed
              ? styles.shadowingSentenceText
              : `${styles.shadowingSentenceText} ${styles.shadowingSentenceTextBlurred}`
          }
        >
          {sentence.mandarin}
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
            isTranscribing
              ? t("shadowingSentence.transcribing")
              : t("shadowingSentence.inputPlaceholder")
          }
          disabled={isTranscribing}
        />
        <button
          type="button"
          className={
            isRecording
              ? `${styles.shadowingSentenceMicButton} ${styles.shadowingSentenceMicButtonActive}`
              : styles.shadowingSentenceMicButton
          }
          onMouseDown={() => void startRecording()}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          aria-label={t("shadowingSentence.record")}
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
              matchesSentence(inputValue, sentence.mandarin)
                ? "correct"
                : "incorrect",
            )
          }
        />
        {checkResult === "correct" && (
          <CheckIcon className={styles.shadowingSentenceResultIcon} />
        )}
        {checkResult === "incorrect" && (
          <IncorrectIcon className={styles.shadowingSentenceResultIcon} />
        )}
      </div>
    </div>
  );
}
