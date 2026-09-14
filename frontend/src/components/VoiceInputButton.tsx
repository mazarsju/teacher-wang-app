import { useTranslation } from "react-i18next";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { transcribeChatAudio } from "../utils/aiChat/chatApi";
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
  const { phase, error, pressHandlers } = useVoiceInput(transcribeChatAudio, (text) =>
    onChange(value + text),
  );

  return (
    <>
      <button
        type="button"
        className={[
          styles.voiceInputButton,
          phase === "recording" ? styles.voiceInputButtonActive : "",
          phase === "processing" ? styles.voiceInputButtonProcessing : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={
          phase === "recording"
            ? t("voiceInput.recording")
            : phase === "processing"
              ? t("voiceInput.processing")
              : t("voiceInput.recordVoice")
        }
        title={
          phase === "recording"
            ? t("voiceInput.recording")
            : phase === "processing"
              ? t("voiceInput.processing")
              : t("voiceInput.recordVoice")
        }
        disabled={disabled || phase === "processing"}
        {...pressHandlers}
      >
        <MicrophoneIcon className={styles.voiceInputIcon} />
      </button>
      {error && <p className={styles.voiceInputError}>{error}</p>}
    </>
  );
}
