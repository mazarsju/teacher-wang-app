import { useEffect, useState, type FormEvent } from "react";
import Button from "./Button";

type AnkiCustomFieldModalProps = {
  isOpen: boolean;
  onConfirm: (title: string, description: string) => void;
  onCancel: () => void;
};

export default function AnkiCustomFieldModal({
  isOpen,
  onConfirm,
  onCancel,
}: AnkiCustomFieldModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setTitle("");
    setDescription("");
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const trimmedTitle = title.trim();
  const isConfirmDisabled = trimmedTitle === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isConfirmDisabled) {
      return;
    }
    onConfirm(trimmedTitle, description.trim());
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-custom-field-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anki-custom-field-title" className="modal-title">
          Add custom field
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">Title</span>
            <input
              type="text"
              value={title}
              placeholder="e.g. example sentence"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="modal-field">
            <span className="modal-field-label">Description</span>
            <input
              type="text"
              value={description}
              placeholder="What this field is for"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <Button kind="cancel" text="Cancel" onClick={onCancel} />
            <Button
              kind="confirm"
              htmlType="submit"
              text="Confirm"
              disabled={isConfirmDisabled}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
