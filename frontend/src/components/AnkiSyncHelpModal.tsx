import { useTranslation } from "react-i18next";
import Button from "./Button";
import vocabularyNoteTypeStyles from "./VocabularyNoteTypeInfoModal.module.css";

type AnkiSyncHelpModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AnkiSyncHelpModal({
  isOpen,
  onClose,
}: AnkiSyncHelpModalProps) {
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
        aria-labelledby="anki-sync-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anki-sync-help-title" className="modal-title">
          {t("ankiSyncHelpModal.title")}
        </h2>
        <ul className={vocabularyNoteTypeStyles.ankiNoteTypeDirections}>
          <li>{t("ankiSyncHelpModal.bullet1")}</li>
          <li>{t("ankiSyncHelpModal.bullet2")}</li>
          <li>{t("ankiSyncHelpModal.bullet3")}</li>
        </ul>
        <div className="modal-actions">
          <Button kind="confirm" text={t("ankiSyncHelpModal.close")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
