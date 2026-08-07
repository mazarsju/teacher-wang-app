import { WarningIcon } from "./icons";

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
        <div className="warning-modal-header">
          <WarningIcon className="warning-modal-icon" />
          <h2 id="warning-modal-title" className="modal-title warning-modal-title">
            Warning
          </h2>
        </div>
        <p id="warning-modal-message" className="modal-message" role="alert">
          {message}
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-button-confirm-primary"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
