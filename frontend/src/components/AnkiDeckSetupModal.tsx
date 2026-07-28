import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ANKI_DECK_DESCRIPTIONS,
  ANKI_DECK_LABELS,
  ANKI_REQUIRED_FIELDS,
  type AnkiDeckKind,
  type AnkiDeckMapping,
  type AnkiDeckSetupResult,
  type AnkiFieldKey,
} from "../types/anki";
import {
  fetchAnkiDecks,
  fetchAnkiModelFields,
  fetchAnkiModels,
  setupAnkiDeck,
} from "../utils/ankiApi";
import { InfoIcon } from "./icons";
import VocabularyNoteTypeInfoModal from "./VocabularyNoteTypeInfoModal";
import VocabularyThreeDirectionSetupModal from "./VocabularyThreeDirectionSetupModal";
import WritingDeckTypeInfoModal from "./WritingDeckTypeInfoModal";

type AnkiDeckSetupModalProps = {
  isOpen: boolean;
  kind: AnkiDeckKind | null;
  /** Saved mapping from the settings table (via /anki/status). */
  initialMapping?: AnkiDeckMapping | null;
  onCancel: () => void;
  onConfigured: () => void;
};

function emptyFieldMap(kind: AnkiDeckKind): Record<AnkiFieldKey, string> {
  return Object.fromEntries(
    ANKI_REQUIRED_FIELDS[kind].map((field) => [field.key, ""]),
  ) as Record<AnkiFieldKey, string>;
}

function fieldMapFromSaved(
  kind: AnkiDeckKind,
  saved: AnkiDeckMapping | null | undefined,
): Record<AnkiFieldKey, string> {
  const next = emptyFieldMap(kind);
  if (!saved?.fields) {
    return next;
  }
  for (const field of ANKI_REQUIRED_FIELDS[kind]) {
    const value = saved.fields[field.key];
    if (typeof value === "string" && value.trim() !== "") {
      next[field.key] = value;
    }
  }
  return next;
}

function withPreferredOption(options: string[], preferred: string): string[] {
  if (preferred === "" || options.includes(preferred)) {
    return options;
  }
  return [preferred, ...options];
}

export default function AnkiDeckSetupModal({
  isOpen,
  kind,
  initialMapping = null,
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
  const [isDeckTypeInfoOpen, setIsDeckTypeInfoOpen] = useState(false);
  const [isAutoCreateOpen, setIsAutoCreateOpen] = useState(false);

  const requiredFields = useMemo(
    () => (kind ? ANKI_REQUIRED_FIELDS[kind] : []),
    [kind],
  );
  const showVocabularyDeckTypeHelp = kind === "mandarin_vocabulary";
  const showWritingDeckTypeHelp = kind === "mandarin_writting";

  const loadCatalog = useCallback(
    async (deckKind: AnkiDeckKind, saved: AnkiDeckMapping | null) => {
      setIsLoading(true);
      setError(null);

      const preferredDeck = saved?.deck_name?.trim() ?? "";
      const preferredModel = saved?.model_name?.trim() ?? "";
      const savedFields = fieldMapFromSaved(deckKind, saved);

      try {
        const [fetchedDecks, fetchedModels] = await Promise.all([
          fetchAnkiDecks(),
          fetchAnkiModels(),
        ]);
        const deckNames = withPreferredOption(fetchedDecks, preferredDeck);
        const modelNames = withPreferredOption(fetchedModels, preferredModel);
        setDecks(deckNames);
        setModels(modelNames);
        setSelectedDeck(
          preferredDeck !== "" ? preferredDeck : (deckNames[0] ?? ""),
        );
        setSelectedModel(
          preferredModel !== "" ? preferredModel : (modelNames[0] ?? ""),
        );
        setFieldMap(savedFields);
        setModelFields([]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Anki decks and deck types.",
        );
        setDecks(preferredDeck !== "" ? [preferredDeck] : []);
        setModels(preferredModel !== "" ? [preferredModel] : []);
        setSelectedDeck(preferredDeck);
        setSelectedModel(preferredModel);
        setModelFields([]);
        setFieldMap(savedFields);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isOpen || kind === null) {
      return;
    }

    setCreateMode(false);
    setNewDeckName("");
    setIsDeckTypeInfoOpen(false);
    setIsAutoCreateOpen(false);
    void loadCatalog(kind, initialMapping);
  }, [isOpen, kind, initialMapping, loadCatalog]);

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

  const deckKind = kind;
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
        kind: deckKind,
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

  async function handleAutoCreated(result: AnkiDeckSetupResult) {
    setIsAutoCreateOpen(false);
    setIsDeckTypeInfoOpen(false);
    setCreateMode(false);
    setNewDeckName("");
    setError(null);
    setIsLoading(true);

    try {
      const [deckNames, modelNames] = await Promise.all([
        fetchAnkiDecks(),
        fetchAnkiModels(),
      ]);
      setDecks(deckNames);
      setModels(modelNames);
      setSelectedDeck(result.deck.deck_name);
      setSelectedModel(result.deck.model_name);

      setFieldMap(fieldMapFromSaved("mandarin_vocabulary", result.deck));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to refresh Anki decks and deck types.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className="modal-dialog anki-setup-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="anki-deck-setup-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="anki-deck-setup-title" className="modal-title">
            Set up {ANKI_DECK_LABELS[deckKind]}
          </h2>
          <p className="modal-message anki-setup-description">
            {ANKI_DECK_DESCRIPTIONS[deckKind]}
          </p>

          {isLoading && <p>Loading decks and deck types from Anki…</p>}
          {error && <p className="table-error">{error}</p>}

          {!isLoading && (
            <form
              className="modal-form"
              onSubmit={(event) => void handleSubmit(event)}
            >
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
                    placeholder="Mandarin vocabulary"
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

              <div className="modal-field">
                <div className="anki-note-type-label-row">
                  <span className="modal-field-label" id="anki-deck-type-label">
                    Deck type
                  </span>
                  {(showVocabularyDeckTypeHelp || showWritingDeckTypeHelp) && (
                    <button
                      type="button"
                      className="home-hsk-info-button"
                      aria-label={
                        showVocabularyDeckTypeHelp
                          ? "About vocabulary deck types"
                          : "About writing deck types"
                      }
                      title={
                        showVocabularyDeckTypeHelp
                          ? "About vocabulary deck types"
                          : "About writing deck types"
                      }
                      onClick={() => setIsDeckTypeInfoOpen(true)}
                    >
                      <InfoIcon className="home-hsk-info-icon" />
                    </button>
                  )}
                </div>
                <select
                  className="anki-deck-select"
                  aria-labelledby="anki-deck-type-label"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  disabled={models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">No deck types found</option>
                  ) : (
                    models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <fieldset className="anki-field-mapping">
                <legend className="anki-field-mapping-legend">
                  Field mapping
                </legend>
                <p className="anki-field-mapping-hint">
                  Map each learn-mandarin field to a field on the selected Anki
                  deck type.
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

      {showVocabularyDeckTypeHelp && (
        <>
          <VocabularyNoteTypeInfoModal
            isOpen={isDeckTypeInfoOpen}
            onClose={() => setIsDeckTypeInfoOpen(false)}
            onCreateAutomatically={() => {
              setIsDeckTypeInfoOpen(false);
              setIsAutoCreateOpen(true);
            }}
          />
          <VocabularyThreeDirectionSetupModal
            isOpen={isAutoCreateOpen}
            onCancel={() => setIsAutoCreateOpen(false)}
            onCreated={(result: AnkiDeckSetupResult) => {
              void handleAutoCreated(result);
            }}
          />
        </>
      )}

      {showWritingDeckTypeHelp && (
        <WritingDeckTypeInfoModal
          isOpen={isDeckTypeInfoOpen}
          onClose={() => setIsDeckTypeInfoOpen(false)}
        />
      )}
    </>
  );
}
