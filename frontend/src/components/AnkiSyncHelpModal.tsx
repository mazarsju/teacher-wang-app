type AnkiSyncHelpModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AnkiSyncHelpModal({
  isOpen,
  onClose,
}: AnkiSyncHelpModalProps) {
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
          Anki synchronization gotchas
        </h2>
        <ul className="anki-note-type-directions">
          <li>
            Make sure your Anki cards have a &quot;definition&quot; (they
            cannot be imported if this field is empty).
          </li>
          <li>
            Make sure your Anki cards have the correct syntax for pinyin:
            should have either the &quot;pinyin&quot; or the
            &quot;numerical&quot; format. If a card is composed of several
            pinyins, they should be split by a space.
          </li>
          <li>
            Make sure, if you haven&apos;t set the pinyin for this card, that
            the pinyin of the character can be detected automatically from
            another card.
          </li>
        </ul>
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
