import { useState, type FormEvent } from "react";
import Button from "./Button";
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
          Correct this sentence
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">Your correction</span>
            <textarea
              className={styles.sentenceCorrectionModalTextarea}
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <Button kind="cancel" text="Cancel" onClick={onCancel} />
            <Button
              kind="confirm"
              text="Save"
              htmlType="submit"
              disabled={text.trim() === ""}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
