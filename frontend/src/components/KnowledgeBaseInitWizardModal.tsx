type KnowledgeBaseInitWizardModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function KnowledgeBaseInitWizardModal({
  isOpen,
  onClose,
}: KnowledgeBaseInitWizardModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-init-wizard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="kb-init-wizard-title" className="modal-title">
          Build your knowledge base
        </h2>
        <div className="modal-actions">
          <button type="button" className="modal-button-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
