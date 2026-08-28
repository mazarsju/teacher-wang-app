import { useTranslation } from "react-i18next";
import Button from "./Button";

type ConfirmModalProps = {
  isOpen: boolean;
  message: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  isOpen,
  message,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation("common");

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-message"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="confirm-modal-message" className="modal-message">
          {message}
        </p>
        {danger && (
          <p id="confirm-modal-message" className="modal-message--danger">
            {t("confirmModal.irreversibleWarning")}
          </p>
        )}
        <div className="modal-actions">
          <Button kind="cancel" text={t("confirmModal.cancel")} onClick={onCancel} />
          <Button
            kind={danger ? "danger" : "confirm"}
            variant="confirmation"
            text={t("confirmModal.confirm")}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}
