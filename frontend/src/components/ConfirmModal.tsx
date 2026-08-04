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
            This action is irreversible.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-button-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${danger ? "button--danger" : ""}`}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
