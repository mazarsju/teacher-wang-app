import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ANKI_REQUIRED_FIELDS,
  type AnkiCustomFieldDef,
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
} from "../utils/anki/ankiApi";
import AnkiCustomFieldModal from "./AnkiCustomFieldModal";
import Button from "./Button";
import { InfoIcon } from "./icons";
import VocabularyNoteTypeInfoModal from "./VocabularyNoteTypeInfoModal";
import VocabularyThreeDirectionSetupModal from "./VocabularyThreeDirectionSetupModal";
import WritingDeckTypeInfoModal from "./WritingDeckTypeInfoModal";
import styles from "./AnkiDeckSetupModal.module.css";

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

function customFieldsFromSaved(
  kind: AnkiDeckKind,
  saved: AnkiDeckMapping | null | undefined,
): AnkiCustomFieldDef[] {
  if (kind !== "mandarin_vocabulary") {
    return [];
  }
  return saved?.custom_fields ?? [];
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
  const { t } = useTranslation("preferences");
  const [decks, setDecks] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelFields, setModelFields] = useState<string[]>([]);
  const [selectedDeck, setSelectedDeck] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<AnkiFieldKey, string>>(
    {} as Record<AnkiFieldKey, string>,
  );
  const [customFields, setCustomFields] = useState<AnkiCustomFieldDef[]>([]);
  const [createMode, setCreateMode] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeckTypeInfoOpen, setIsDeckTypeInfoOpen] = useState(false);
  const [isAutoCreateOpen, setIsAutoCreateOpen] = useState(false);
  const [isAddCustomFieldOpen, setIsAddCustomFieldOpen] = useState(false);

  const requiredFields = useMemo(
    () => (kind ? ANKI_REQUIRED_FIELDS[kind] : []),
    [kind],
  );
  const showVocabularyDeckTypeHelp = kind === "mandarin_vocabulary";
  const showWritingDeckTypeHelp = kind === "mandarin_writing";

  const loadCatalog = useCallback(
    async (deckKind: AnkiDeckKind, saved: AnkiDeckMapping | null) => {
      setIsLoading(true);
      setError(null);

      const preferredDeck = saved?.deck_name?.trim() ?? "";
      const preferredModel = saved?.model_name?.trim() ?? "";
      const savedFields = fieldMapFromSaved(deckKind, saved);
      setCustomFields(customFieldsFromSaved(deckKind, saved));

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
            : t("ankiDeckSetupModal.errors.loadCatalog"),
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
    [t],
  );

  useEffect(() => {
    if (!isOpen || kind === null) {
      return;
    }

    setCreateMode(false);
    setNewDeckName("");
    setIsDeckTypeInfoOpen(false);
    setIsAutoCreateOpen(false);
    setIsAddCustomFieldOpen(false);
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
        setCustomFields((current) =>
          current.map((field) =>
            fields.includes(field.anki_field)
              ? field
              : { ...field, anki_field: "" },
          ),
        );
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setModelFields([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("ankiDeckSetupModal.errors.loadFields"),
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
  }, [isOpen, selectedModel, t]);

  if (!isOpen || kind === null) {
    return null;
  }

  const deckKind = kind;
  const trimmedNewName = newDeckName.trim();
  const deckReady = createMode ? trimmedNewName !== "" : selectedDeck !== "";
  const fieldsReady = requiredFields.every(
    (field) => fieldMap[field.key]?.trim(),
  );
  const customFieldsReady = customFields.every(
    (field) => field.title.trim() !== "" && field.anki_field.trim() !== "",
  );
  const isConfirmDisabled =
    !deckReady ||
    selectedModel === "" ||
    !fieldsReady ||
    !customFieldsReady ||
    isSaving ||
    isLoading ||
    isLoadingFields;

  function handleCustomFieldConfirm(title: string, description: string) {
    setCustomFields((current) => [
      ...current,
      { id: crypto.randomUUID(), title, description, anki_field: "" },
    ]);
    setIsAddCustomFieldOpen(false);
  }

  function removeCustomField(id: string) {
    setCustomFields((current) => current.filter((field) => field.id !== id));
  }

  function updateCustomField(id: string, patch: Partial<AnkiCustomFieldDef>) {
    setCustomFields((current) =>
      current.map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
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
      const fieldsPayload = Object.fromEntries(
        requiredFields.map((field) => [field.key, fieldMap[field.key].trim()]),
      ) as Record<AnkiFieldKey, string>;

      await setupAnkiDeck({
        kind: deckKind,
        deckName: createMode ? trimmedNewName : selectedDeck,
        modelName: selectedModel,
        fields: fieldsPayload,
        customFields: deckKind === "mandarin_vocabulary" ? customFields : [],
        create: createMode,
      });
      onConfigured();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("ankiDeckSetupModal.errors.save"),
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
      setCustomFields(customFieldsFromSaved("mandarin_vocabulary", result.deck));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("ankiDeckSetupModal.errors.refresh"),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className={`modal-dialog ${styles.ankiSetupModal}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="anki-deck-setup-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="anki-deck-setup-title" className="modal-title">
            {t("ankiDeckSetupModal.title", {
              deckLabel: t(`ankiDeckKind.labels.${deckKind}`),
            })}
          </h2>
          <p className={`modal-message ${styles.ankiSetupDescription}`}>
            {t(`ankiDeckKind.descriptions.${deckKind}`)}
          </p>

          {isLoading && <p>{t("ankiDeckSetupModal.loading")}</p>}
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
                <span className="modal-field-label">
                  {t("ankiDeckSetupModal.createNewDeck")}
                </span>
              </label>

              {createMode ? (
                <label className="modal-field">
                  <span className="modal-field-label">
                    {t("ankiDeckSetupModal.newDeckNameLabel")}
                  </span>
                  <input
                    type="text"
                    value={newDeckName}
                    placeholder={t("ankiDeckSetupModal.newDeckNamePlaceholder")}
                    onChange={(event) => setNewDeckName(event.target.value)}
                  />
                </label>
              ) : (
                <label className="modal-field">
                  <span className="modal-field-label">
                    {t("ankiDeckSetupModal.existingDeckLabel")}
                  </span>
                  <select
                    className={styles.ankiDeckSelect}
                    value={selectedDeck}
                    onChange={(event) => setSelectedDeck(event.target.value)}
                    disabled={decks.length === 0}
                  >
                    {decks.length === 0 ? (
                      <option value="">{t("ankiDeckSetupModal.noDecksFound")}</option>
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
                <div className={styles.ankiNoteTypeLabelRow}>
                  <span className="modal-field-label" id="anki-deck-type-label">
                    {t("ankiDeckSetupModal.deckTypeLabel")}
                  </span>
                  {(showVocabularyDeckTypeHelp || showWritingDeckTypeHelp) && (
                    <button
                      type="button"
                      className="home-hsk-info-button"
                      aria-label={
                        showVocabularyDeckTypeHelp
                          ? t("ankiDeckSetupModal.aboutVocabularyDeckTypes")
                          : t("ankiDeckSetupModal.aboutWritingDeckTypes")
                      }
                      title={
                        showVocabularyDeckTypeHelp
                          ? t("ankiDeckSetupModal.aboutVocabularyDeckTypes")
                          : t("ankiDeckSetupModal.aboutWritingDeckTypes")
                      }
                      onClick={() => setIsDeckTypeInfoOpen(true)}
                    >
                      <InfoIcon className="home-hsk-info-icon" />
                    </button>
                  )}
                </div>
                <select
                  className={styles.ankiDeckSelect}
                  aria-labelledby="anki-deck-type-label"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  disabled={models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">{t("ankiDeckSetupModal.noDeckTypesFound")}</option>
                  ) : (
                    models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <fieldset className={styles.ankiFieldMapping}>
                <legend className={styles.ankiFieldMappingLegend}>
                  {t("ankiDeckSetupModal.fieldMapping.legend")}
                </legend>
                <p className={styles.ankiFieldMappingHint}>
                  {t("ankiDeckSetupModal.fieldMapping.hint")}
                </p>
                {isLoadingFields && <p>{t("ankiDeckSetupModal.loadingNoteFields")}</p>}
                {requiredFields.map((field) => (
                  <label key={field.key} className="modal-field">
                    <span className="modal-field-label">
                      {field.key}{" "}
                      <span className={styles.ankiFieldDescription}>
                        ({field.description})
                      </span>
                    </span>
                    <select
                      className={styles.ankiDeckSelect}
                      value={fieldMap[field.key] ?? ""}
                      onChange={(event) =>
                        setFieldMap((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      disabled={modelFields.length === 0 || isLoadingFields}
                    >
                      <option value="">
                        {t("ankiDeckSetupModal.selectAnkiFieldPlaceholder")}
                      </option>
                      {modelFields.map((ankiField) => (
                        <option key={ankiField} value={ankiField}>
                          {ankiField}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>

              {deckKind === "mandarin_vocabulary" && (
                <fieldset className={styles.ankiFieldMapping}>
                  <legend className={styles.ankiFieldMappingLegend}>
                    {t("ankiDeckSetupModal.customFields.legend")}
                  </legend>
                  <p className={styles.ankiFieldMappingHint}>
                    {t("ankiDeckSetupModal.customFields.hint")}
                  </p>
                  {customFields.map((field) => (
                    <div key={field.id} className="modal-field">
                      <span
                        className="modal-field-label"
                        id={`anki-custom-field-label-${field.id}`}
                      >
                        {field.title}{" "}
                        {field.description !== "" && (
                          <span className={styles.ankiFieldDescription}>
                            ({field.description})
                          </span>
                        )}
                      </span>
                      <div className={styles.ankiCustomFieldRow}>
                        <select
                          className={styles.ankiDeckSelect}
                          aria-labelledby={`anki-custom-field-label-${field.id}`}
                          value={field.anki_field}
                          onChange={(event) =>
                            updateCustomField(field.id, {
                              anki_field: event.target.value,
                            })
                          }
                          disabled={modelFields.length === 0 || isLoadingFields}
                        >
                          <option value="">
                            {t("ankiDeckSetupModal.selectAnkiFieldPlaceholder")}
                          </option>
                          {modelFields.map((ankiField) => (
                            <option key={ankiField} value={ankiField}>
                              {ankiField}
                            </option>
                          ))}
                        </select>
                        <Button
                          kind="danger"
                          variant="modal"
                          text={t("ankiDeckSetupModal.customFields.remove")}
                          onClick={() => removeCustomField(field.id)}
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    kind="confirm"
                    variant="modal"
                    text={t("ankiDeckSetupModal.customFields.addCustom")}
                    onClick={() => setIsAddCustomFieldOpen(true)}
                  />
                </fieldset>
              )}

              <div className="modal-actions">
                <Button kind="cancel" text={t("ankiDeckSetupModal.cancel")} onClick={onCancel} />
                <Button
                  kind="confirm"
                  htmlType="submit"
                  text={
                    isSaving
                      ? t("ankiDeckSetupModal.saving")
                      : t("ankiDeckSetupModal.save")
                  }
                  disabled={isConfirmDisabled}
                />
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

      <AnkiCustomFieldModal
        isOpen={isAddCustomFieldOpen}
        onConfirm={handleCustomFieldConfirm}
        onCancel={() => setIsAddCustomFieldOpen(false)}
      />
    </>
  );
}
