import { InfoIcon } from "./icons";
import styles from "./VocabularyNoteTypeInfoModal.module.css";

type VocabularyNoteTypeInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreateAutomatically: () => void;
};

export default function VocabularyNoteTypeInfoModal({
  isOpen,
  onClose,
  onCreateAutomatically,
}: VocabularyNoteTypeInfoModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vocabulary-note-type-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.ankiNoteTypeInfoHeader}>
          <h2 id="vocabulary-note-type-info-title" className="modal-title">
            Vocabulary deck type
          </h2>
          <InfoIcon className="home-hsk-info-icon" />
        </div>
        <p className="home-hsk-info-text">
          This deck type should have 3 directions:
        </p>
        <ol className={styles.ankiNoteTypeDirections}>
          <li>asking writing → guessing pinyin + definition</li>
          <li>asking pinyin → guessing writing + definition</li>
          <li>asking definition → guessing writing + pinyin</li>
        </ol>
        <p className="home-hsk-info-text">
          If you do not already have such a deck type in Anki, you can create one
          automatically with the mandatory fields and optional extras.
        </p>
        <div className={`modal-actions ${styles.ankiNoteTypeInfoActions}`}>
          <button
            type="button"
            className="modal-button-cancel"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="modal-button-confirm-primary"
            onClick={onCreateAutomatically}
          >
            Automatically create a 3-directions deck type
          </button>
        </div>
      </div>
    </div>
  );
}
