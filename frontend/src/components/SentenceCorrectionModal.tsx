import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import VoiceInputButton from "./VoiceInputButton";
import styles from "./SentenceCorrectionModal.module.css";

type SentenceCorrectionModalProps = {
  originalText: string;
  onConfirm: (correctedText: string) => void;
  onCancel: () => void;
};

export default function SentenceCorrectionModal({
  originalText,
  onConfirm,
  onCancel,
}: SentenceCorrectionModalProps) {
  const { t } = useTranslation("writing");
  const [text, setText] = useState(originalText);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "") return;
    onConfirm(trimmed);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sentence-correction-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="sentence-correction-modal-title" className="modal-title">
          {t("sentenceCorrectionModal.title")}
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">{t("sentenceCorrectionModal.fieldLabel")}</span>
            <div className={styles.sentenceCorrectionModalTextareaWrapper}>
              <textarea
                className={styles.sentenceCorrectionModalTextarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                autoFocus
              />
              <VoiceInputButton
                value={text}
                onChange={setText}
                className={styles.sentenceCorrectionModalVoiceButton}
              />
            </div>
          </label>
          <div className="modal-actions">
            <Button kind="cancel" text={t("sentenceCorrectionModal.cancel")} onClick={onCancel} />
            <Button
              kind="confirm"
              text={t("sentenceCorrectionModal.save")}
              htmlType="submit"
              disabled={text.trim() === ""}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
