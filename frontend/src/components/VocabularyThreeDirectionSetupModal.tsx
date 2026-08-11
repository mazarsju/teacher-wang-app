import { useEffect, useState, type FormEvent } from "react";
import type { AnkiDeckSetupResult } from "../types/anki";
import { autoSetupVocabularyDeck } from "../utils/anki/ankiApi";
import ankiDeckSetupStyles from "./AnkiDeckSetupModal.module.css";
import Button from "./Button";
import styles from "./VocabularyThreeDirectionSetupModal.module.css";

type VocabularyThreeDirectionSetupModalProps = {
  isOpen: boolean;
  onCancel: () => void;
  onCreated: (result: AnkiDeckSetupResult) => void;
};

const DEFAULT_DECK_TYPE_NAME = "mandarin-3-directions";
const MANDATORY_FIELDS = ["writing", "pinyin", "definition"] as const;

export default function VocabularyThreeDirectionSetupModal({
  isOpen,
  onCancel,
  onCreated,
}: VocabularyThreeDirectionSetupModalProps) {
  const [modelName, setModelName] = useState(DEFAULT_DECK_TYPE_NAME);
  const [optionalFields, setOptionalFields] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setModelName(DEFAULT_DECK_TYPE_NAME);
    setOptionalFields([]);
    setError(null);
    setIsSaving(false);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const trimmedModel = modelName.trim();
  const isConfirmDisabled = trimmedModel === "" || isSaving;

  function updateOptionalField(index: number, value: string) {
    setOptionalFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? value : field,
      ),
    );
  }

  function removeOptionalField(index: number) {
    setOptionalFields((current) =>
      current.filter((_, fieldIndex) => fieldIndex !== index),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isConfirmDisabled) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await autoSetupVocabularyDeck({
        deckName: trimmedModel,
        modelName: trimmedModel,
        optionalFields: optionalFields
          .map((field) => field.trim())
          .filter((field) => field !== ""),
      });
      onCreated(result);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to create the 3-directions deck type.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay modal-overlay--stacked"
      onClick={onCancel}
    >
      <div
        className={`modal-dialog ${ankiDeckSetupStyles.ankiSetupModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vocabulary-three-direction-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="vocabulary-three-direction-title" className="modal-title">
          Create a 3-directions deck type
        </h2>
        <p className="modal-message">
          Anki will get a new deck type with three card directions and a new
          deck using the same name. You can then review the field mapping and
          save it.
        </p>

        {error && <p className="table-error">{error}</p>}

        <form
          className="modal-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="modal-field">
            <span className="modal-field-label">Deck type name</span>
            <input
              type="text"
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
            />
          </label>

          <fieldset className={ankiDeckSetupStyles.ankiFieldMapping}>
            <legend className={ankiDeckSetupStyles.ankiFieldMappingLegend}>
              Mandatory fields
            </legend>
            <ul className={styles.ankiMandatoryFieldList}>
              {MANDATORY_FIELDS.map((field) => (
                <li key={field} className={styles.ankiMandatoryFieldItem}>
                  {field}
                </li>
              ))}
            </ul>
            <p className={ankiDeckSetupStyles.ankiFieldMappingHint}>
              Directions: writing → pinyin + definition (+ optionals); pinyin →
              writing + definition (+ optionals); definition → writing +
              pinyin (+ optionals).
            </p>
          </fieldset>

          <fieldset className={ankiDeckSetupStyles.ankiFieldMapping}>
            <legend className={ankiDeckSetupStyles.ankiFieldMappingLegend}>
              Optional fields
            </legend>
            <p className={ankiDeckSetupStyles.ankiFieldMappingHint}>
              Optional fields appear on the back of every direction.
            </p>
            {optionalFields.map((field, index) => (
              <div key={index} className={styles.ankiOptionalFieldRow}>
                <input
                  type="text"
                  value={field}
                  placeholder="e.g. example_sentence"
                  aria-label={`Optional field ${index + 1}`}
                  onChange={(event) =>
                    updateOptionalField(index, event.target.value)
                  }
                />
                <Button
                  kind="cancel"
                  text="Remove"
                  onClick={() => removeOptionalField(index)}
                />
              </div>
            ))}
            <Button
              kind="confirm"
              text="Add optional field"
              onClick={() => setOptionalFields((current) => [...current, ""])}
            />
          </fieldset>

          <div className="modal-actions">
            <Button kind="cancel" text="Cancel" onClick={onCancel} />
            <Button
              kind="confirm"
              htmlType="submit"
              text={isSaving ? "Creating…" : "Create and map"}
              disabled={isConfirmDisabled}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
