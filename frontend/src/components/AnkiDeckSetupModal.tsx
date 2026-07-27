import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ANKI_DECK_DESCRIPTIONS,
  ANKI_DECK_LABELS,
  ANKI_REQUIRED_FIELDS,
  type AnkiDeckKind,
  type AnkiFieldKey,
} from "../types/anki";
import {
  fetchAnkiDecks,
  fetchAnkiModelFields,
  fetchAnkiModels,
  setupAnkiDeck,
} from "../utils/ankiApi";

type AnkiDeckSetupModalProps = {
  isOpen: boolean;
  kind: AnkiDeckKind | null;
  onCancel: () => void;
  onConfigured: () => void;
};

function emptyFieldMap(kind: AnkiDeckKind): Record<AnkiFieldKey, string> {
  return Object.fromEntries(
    ANKI_REQUIRED_FIELDS[kind].map((field) => [field.key, ""]),
  ) as Record<AnkiFieldKey, string>;
}

export default function AnkiDeckSetupModal({
  isOpen,
  kind,
  onCancel,
  onConfigured,
}: AnkiDeckSetupModalProps) {
  const [decks, setDecks] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelFields, setModelFields] = useState<string[]>([]);
  const [selectedDeck, setSelectedDeck] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<AnkiFieldKey, string>>(
    {} as Record<AnkiFieldKey, string>,
  );
  const [createMode, setCreateMode] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredFields = useMemo(
    () => (kind ? ANKI_REQUIRED_FIELDS[kind] : []),
    [kind],
  );

  const loadCatalog = useCallback(async (deckKind: AnkiDeckKind) => {
    setIsLoading(true);
    setError(null);

    try {
      const [deckNames, modelNames] = await Promise.all([
        fetchAnkiDecks(),
        fetchAnkiModels(),
      ]);
      setDecks(deckNames);
      setModels(modelNames);
      setSelectedDeck(deckNames[0] ?? "");
      setSelectedModel(modelNames[0] ?? "");
      setFieldMap(emptyFieldMap(deckKind));
      setModelFields([]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load Anki decks and note types.",
      );
      setDecks([]);
      setModels([]);
      setSelectedDeck("");
      setSelectedModel("");
      setModelFields([]);
      setFieldMap(emptyFieldMap(deckKind));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || kind === null) {
      return;
    }

    setCreateMode(false);
    setNewDeckName("");
    void loadCatalog(kind);
  }, [isOpen, kind, loadCatalog]);

  useEffect(() => {
    if (!isOpen || selectedModel === "") {
      setModelFields([]);
      return;
    }

    let cancelled = false;

    async function loadFields() {
      setIsLoadingFields(true);
      setError(null);
      try {
        const fields = await fetchAnkiModelFields(selectedModel);
        if (cancelled) {
          return;
        }
        setModelFields(fields);
        setFieldMap((current) => {
          const next = { ...current };
          for (const key of Object.keys(next) as AnkiFieldKey[]) {
            if (!fields.includes(next[key])) {
              next[key] = "";
            }
          }
          return next;
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setModelFields([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Anki note fields.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingFields(false);
        }
      }
    }

    void loadFields();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedModel]);

  if (!isOpen || kind === null) {
    return null;
  }

  const trimmedNewName = newDeckName.trim();
  const deckReady = createMode ? trimmedNewName !== "" : selectedDeck !== "";
  const fieldsReady = requiredFields.every(
    (field) => fieldMap[field.key]?.trim(),
  );
  const isConfirmDisabled =
    !deckReady ||
    selectedModel === "" ||
    !fieldsReady ||
    isSaving ||
    isLoading ||
    isLoadingFields;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isConfirmDisabled) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const fieldsPayload = Object.fromEntries(
        requiredFields.map((field) => [field.key, fieldMap[field.key].trim()]),
      ) as Record<AnkiFieldKey, string>;

      await setupAnkiDeck({
        kind,
        deckName: createMode ? trimmedNewName : selectedDeck,
        modelName: selectedModel,
        fields: fieldsPayload,
        create: createMode,
      });
      onConfigured();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to set up Anki deck.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog anki-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-deck-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anki-deck-setup-title" className="modal-title">
          Set up {ANKI_DECK_LABELS[kind]}
        </h2>
        <p className="modal-message anki-setup-description">
          {ANKI_DECK_DESCRIPTIONS[kind]}
        </p>

        {isLoading && <p>Loading decks and note types from Anki…</p>}
        {error && <p className="table-error">{error}</p>}

        {!isLoading && (
          <form className="modal-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="modal-field-toggle">
              <input
                type="checkbox"
                checked={createMode}
                onChange={(event) => setCreateMode(event.target.checked)}
              />
              <span className="modal-field-label">Create a new deck</span>
            </label>

            {createMode ? (
              <label className="modal-field">
                <span className="modal-field-label">New deck name</span>
                <input
                  type="text"
                  value={newDeckName}
                  placeholder="learn-mandarin::characters"
                  onChange={(event) => setNewDeckName(event.target.value)}
                />
              </label>
            ) : (
              <label className="modal-field">
                <span className="modal-field-label">Existing deck</span>
                <select
                  className="anki-deck-select"
                  value={selectedDeck}
                  onChange={(event) => setSelectedDeck(event.target.value)}
                  disabled={decks.length === 0}
                >
                  {decks.length === 0 ? (
                    <option value="">No decks found</option>
                  ) : (
                    decks.map((deck) => (
                      <option key={deck} value={deck}>
                        {deck}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            <label className="modal-field">
              <span className="modal-field-label">Note type</span>
              <select
                className="anki-deck-select"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={models.length === 0}
              >
                {models.length === 0 ? (
                  <option value="">No note types found</option>
                ) : (
                  models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
            </label>

            <fieldset className="anki-field-mapping">
              <legend className="anki-field-mapping-legend">Field mapping</legend>
              <p className="anki-field-mapping-hint">
                Map each learn-mandarin field to a field on the selected Anki note
                type.
              </p>
              {isLoadingFields && <p>Loading note fields…</p>}
              {requiredFields.map((field) => (
                <label key={field.key} className="modal-field">
                  <span className="modal-field-label">
                    {field.key}{" "}
                    <span className="anki-field-description">
                      ({field.description})
                    </span>
                  </span>
                  <select
                    className="anki-deck-select"
                    value={fieldMap[field.key] ?? ""}
                    onChange={(event) =>
                      setFieldMap((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    disabled={modelFields.length === 0 || isLoadingFields}
                  >
                    <option value="">Select Anki field…</option>
                    {modelFields.map((ankiField) => (
                      <option key={ankiField} value={ankiField}>
                        {ankiField}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="modal-button-confirm-primary"
                disabled={isConfirmDisabled}
              >
                {isSaving ? "Saving…" : "Save mapping"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
