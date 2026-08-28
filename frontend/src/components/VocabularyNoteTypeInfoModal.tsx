import { useTranslation } from "react-i18next";
import Button from "./Button";
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
  const { t } = useTranslation("preferences");

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
            {t("vocabularyNoteTypeInfoModal.title")}
          </h2>
          <InfoIcon className="home-hsk-info-icon" />
        </div>
        <p className="home-hsk-info-text">
          {t("vocabularyNoteTypeInfoModal.intro")}
        </p>
        <ol className={styles.ankiNoteTypeDirections}>
          <li>{t("vocabularyNoteTypeInfoModal.direction1")}</li>
          <li>{t("vocabularyNoteTypeInfoModal.direction2")}</li>
          <li>{t("vocabularyNoteTypeInfoModal.direction3")}</li>
        </ol>
        <p className="home-hsk-info-text">
          {t("vocabularyNoteTypeInfoModal.createHint")}
        </p>
        <div className={`modal-actions ${styles.ankiNoteTypeInfoActions}`}>
          <Button kind="cancel" text={t("vocabularyNoteTypeInfoModal.close")} onClick={onClose} />
          <Button
            kind="confirm"
            text={t("vocabularyNoteTypeInfoModal.createAutomatically")}
            onClick={onCreateAutomatically}
          />
        </div>
      </div>
    </div>
  );
}
