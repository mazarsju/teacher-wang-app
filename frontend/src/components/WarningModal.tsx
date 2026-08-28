import { useTranslation } from "react-i18next";
import Button from "./Button";
import { WarningIcon } from "./icons";
import styles from "./WarningModal.module.css";

type WarningModalProps = {
  isOpen: boolean;
  message: string;
  onClose: () => void;
};

export default function WarningModal({
  isOpen,
  message,
  onClose,
}: WarningModalProps) {
  const { t } = useTranslation("common");

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog--warning"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warning-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.warningModalHeader}>
          <WarningIcon className={styles.warningModalIcon} />
          <h2 id="warning-modal-title" className={`modal-title ${styles.warningModalTitle}`}>
            {t("warningModal.title")}
          </h2>
        </div>
        <p id="warning-modal-message" className="modal-message" role="alert">
          {message}
        </p>
        <div className="modal-actions">
          <Button kind="confirm" text={t("warningModal.ok")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
