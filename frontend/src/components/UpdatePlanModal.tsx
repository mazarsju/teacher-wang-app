const ISSUES_URL = "https://github.com/mazarsju/teacher-wang-app/issues";

type UpdatePlanModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function UpdatePlanModal({ isOpen, onClose }: UpdatePlanModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-plan-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="update-plan-modal-title" className="modal-title">
          Upgrade your plan
        </h2>
        <p className="modal-message">
          You&apos;re an early bird! The app is still under construction, so
          there&apos;s no paid plan just yet. Want to unlock the Pro plan for
          free for 3 months (100&times; your monthly AI usage)? Help build the
          product by posting your first issue on{" "}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>{" "}
          and I&apos;ll set you up!
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
