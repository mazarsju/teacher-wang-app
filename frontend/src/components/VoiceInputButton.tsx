import { useTranslation } from "react-i18next";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { MicrophoneIcon } from "./icons";
import styles from "./VoiceInputButton.module.css";

type VoiceInputButtonProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function VoiceInputButton({
  value,
  onChange,
  disabled,
  className,
}: VoiceInputButtonProps) {
  const { t } = useTranslation("common");
  const { isRecording, isTranscribing, error, startRecording, stopRecording } =
    useVoiceInput(value, onChange);

  return (
    <>
      <button
        type="button"
        className={[
          styles.voiceInputButton,
          isRecording ? styles.voiceInputButtonActive : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={
          isRecording ? t("voiceInput.recording") : t("voiceInput.recordVoice")
        }
        title={isRecording ? t("voiceInput.recording") : t("voiceInput.recordVoice")}
        disabled={disabled || isTranscribing}
        onMouseDown={() => void startRecording()}
        onMouseUp={stopRecording}
        onMouseLeave={stopRecording}
      >
        <MicrophoneIcon className={styles.voiceInputIcon} />
      </button>
      {error && <p className={styles.voiceInputError}>{error}</p>}
    </>
  );
}
