type WritingDeckTypeInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function WritingDeckTypeInfoModal({
  isOpen,
  onClose,
}: WritingDeckTypeInfoModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="writing-deck-type-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="writing-deck-type-info-title" className="modal-title">
          Writing deck type
        </h2>
        <p className="home-hsk-info-text">
          Choose a 1-direction deck type. Typically, the Basic type should work
          fine.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-button-confirm-primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
