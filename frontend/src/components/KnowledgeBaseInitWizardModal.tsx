import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PageId } from "./Navbar";
import Table, { type TableColumn } from "./Table";
import { ImportIcon } from "./icons";
import { useAppDispatch } from "../store/hooks";
import { syncAppData } from "../store/thunks/syncAppData";
import type { HskWord } from "../types/hskWord";
import {
  extractCharacterEntries,
  normalizeImportPinyin,
  type SmartWordRow,
} from "../utils/knowledgeBase/buildImportLines";
import { bulkCreateCharacters } from "../utils/knowledgeBase/charactersApi";
import {
  INITIAL_WORD_PICK_STATE,
  pickNextHskWord,
  type WordPickDecision,
  type WordPickResponse,
  type WordPickState,
} from "../utils/knowledgeBase/hskWordsApi";
import { importDatabase } from "../utils/knowledgeBase/knowledgeBaseApi";
import { bulkCreateWords } from "../utils/knowledgeBase/wordsApi";
import Button from "./Button";
import kbPageStyles from "../pages/KnowledgeBasePage.module.css";
import tableStyles from "./Table.module.css";
import styles from "./KnowledgeBaseInitWizardModal.module.css";

// Keeps each request under the backend's bulk-create limit (see
// backend/routes/bulk_create_words.py / bulk_create_characters.py).
const BULK_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

type KnowledgeBaseInitWizardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (page: PageId) => void;
};

type WizardStep = "choose" | "manual-info" | "anki-info" | "csv" | "smart";

export default function KnowledgeBaseInitWizardModal({
  isOpen,
  onClose,
  onNavigate,
}: KnowledgeBaseInitWizardModalProps) {
  const { t } = useTranslation("common");
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<WizardStep>("choose");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [candidateWord, setCandidateWord] = useState<HskWord | null>(null);
  const [pickState, setPickState] = useState<WordPickState>(
    INITIAL_WORD_PICK_STATE,
  );
  const [isPickingWord, setIsPickingWord] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [seenWords, setSeenWords] = useState<string[]>([]);
  const [smartWords, setSmartWords] = useState<SmartWordRow[]>([]);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [isSmartSubmitting, setIsSmartSubmitting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [hasRecognizedOnly, setHasRecognizedOnly] = useState(false);
  const [isSmartSetupDone, setIsSmartSetupDone] = useState(false);

  if (!isOpen) {
    return null;
  }

  function resetAndClose() {
    setStep("choose");
    setImportError(null);
    setCandidateWord(null);
    setPickState(INITIAL_WORD_PICK_STATE);
    setSeenWords([]);
    setSmartWords([]);
    setSmartError(null);
    setHasRecognizedOnly(false);
    setIsSmartSetupDone(false);
    setSyncProgress(null);
    onClose();
  }

  function goToKnowledgeBase() {
    onNavigate?.("knowledge-base");
    resetAndClose();
  }

  function goToPreferences() {
    onNavigate?.("preferences");
    resetAndClose();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setImportError(null);
    setIsImporting(true);

    try {
      await importDatabase(file);
      await dispatch(syncAppData()).unwrap();
      resetAndClose();
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : t("knowledgeBaseInitWizardModal.errors.import"),
      );
      setIsImporting(false);
    }
  }

  // A word arriving twice in a row (or the walk running out of words
  // entirely) means there's nothing more to usefully ask — the exponential
  // walk has converged. Apply the result and flag the session as done
  // instead of re-showing (or endlessly re-fetching) the same word.
  function applyPickResult(result: WordPickResponse, previousWord: string | null) {
    setPickState(result.state);
    if (result.word === null || result.word.word === previousWord) {
      setIsSmartSetupDone(true);
      setCandidateWord(null);
    } else {
      setCandidateWord(result.word);
    }
  }

  async function fetchInitialWord() {
    setIsPickingWord(true);
    setPickError(null);

    try {
      const result = await pickNextHskWord(INITIAL_WORD_PICK_STATE, null, []);
      applyPickResult(result, null);
    } catch (error) {
      setPickError(
        error instanceof Error
          ? error.message
          : t("knowledgeBaseInitWizardModal.errors.pickWord"),
      );
    } finally {
      setIsPickingWord(false);
    }
  }

  function startSmartCreation() {
    setSmartWords([]);
    setSeenWords([]);
    setCandidateWord(null);
    setSmartError(null);
    setPickState(INITIAL_WORD_PICK_STATE);
    setHasRecognizedOnly(false);
    setIsSmartSetupDone(false);
    setStep("smart");
    void fetchInitialWord();
  }

  // Applies one of the three Part 2 decisions: doubles/shrinks the walk's
  // step (see backend/hsk_word_picker.py), bulk-adds any words the walk
  // jumped over as implicitly known, and fetches the next candidate. Keeps
  // showing the current word (buttons just go disabled) until the next one
  // is ready, so Part 2 doesn't collapse and jump between picks.
  async function applyDecision(
    decision: WordPickDecision,
    knownToWrite: boolean | null,
  ) {
    if (!candidateWord || isPickingWord) {
      return;
    }

    if (seenWords.includes(candidateWord.word)) {
      // Already recorded (e.g. retrying after a failed pick) — just retry
      // loading the next word instead of recording it twice.
      void fetchNextWord(decision, seenWords, candidateWord.word);
      return;
    }

    const decidedWord = candidateWord;
    const decidedRow: SmartWordRow[] =
      knownToWrite === null
        ? []
        : [
            {
              word: decidedWord.word,
              pinyin: decidedWord.pinyin,
              definition: decidedWord.definition,
              knownToWrite,
            },
          ];

    setIsPickingWord(true);
    setPickError(null);

    try {
      const result = await pickNextHskWord(pickState, decision, seenWords);
      const betweenRows: SmartWordRow[] = result.wordsBetween.map((word) => ({
        word: word.word,
        pinyin: word.pinyin,
        definition: word.definition,
        knownToWrite: decision === "can_write",
      }));

      if (decidedRow.length > 0 || betweenRows.length > 0) {
        setSmartWords((previous) => [...previous, ...decidedRow, ...betweenRows]);
      }
      setSeenWords((previous) => [
        ...previous,
        decidedWord.word,
        ...result.wordsBetween.map((word) => word.word),
      ]);
      applyPickResult(result, decidedWord.word);
    } catch (error) {
      setPickError(
        error instanceof Error
          ? error.message
          : t("knowledgeBaseInitWizardModal.errors.pickWord"),
      );
    } finally {
      setIsPickingWord(false);
    }
  }

  async function fetchNextWord(
    decision: WordPickDecision,
    exclude: string[],
    previousWord: string,
  ) {
    setIsPickingWord(true);
    setPickError(null);

    try {
      const result = await pickNextHskWord(pickState, decision, exclude);
      applyPickResult(result, previousWord);
    } catch (error) {
      setPickError(
        error instanceof Error
          ? error.message
          : t("knowledgeBaseInitWizardModal.errors.pickWord"),
      );
    } finally {
      setIsPickingWord(false);
    }
  }

  function handleDontKnowWord() {
    void applyDecision("dont_know", null);
  }

  function handleCanRecognizeWord() {
    setHasRecognizedOnly(true);
    void applyDecision("can_recognize", false);
  }

  function handleCanWriteWord() {
    void applyDecision("can_write", true);
  }

  function toggleSmartWordKnownToWrite(word: string) {
    setSmartWords((previous) =>
      previous.map((row) =>
        row.word === word ? { ...row, knownToWrite: !row.knownToWrite } : row,
      ),
    );
  }

  function removeSmartWord(word: string) {
    setSmartWords((previous) => previous.filter((row) => row.word !== word));
  }

  async function confirmSmartCreation() {
    if (smartWords.length === 0) {
      return;
    }

    setSmartError(null);
    setIsSmartSubmitting(true);

    const characterBatches = chunk(
      extractCharacterEntries(smartWords),
      BULK_BATCH_SIZE,
    );
    const wordBatches = chunk(
      smartWords.map((row) => ({
        word: row.word,
        definition: row.definition.trim().slice(0, 100) || null,
        pinyin: normalizeImportPinyin(row.pinyin).trim() || null,
        writing_known: row.knownToWrite,
      })),
      BULK_BATCH_SIZE,
    );
    setSyncProgress({ completed: 0, total: characterBatches.length + wordBatches.length });

    try {
      // Characters must exist before the words that use them can be
      // created (see backend/routes/bulk_create_words.py).
      for (const batch of characterBatches) {
        await bulkCreateCharacters(batch);
        setSyncProgress((previous) =>
          previous ? { ...previous, completed: previous.completed + 1 } : previous,
        );
      }
      for (const batch of wordBatches) {
        await bulkCreateWords(batch);
        setSyncProgress((previous) =>
          previous ? { ...previous, completed: previous.completed + 1 } : previous,
        );
      }
      await dispatch(syncAppData()).unwrap();
      resetAndClose();
    } catch (error) {
      setSmartError(
        error instanceof Error
          ? error.message
          : t("knowledgeBaseInitWizardModal.errors.save"),
      );
      setIsSmartSubmitting(false);
    } finally {
      setSyncProgress(null);
    }
  }

  const smartWordColumns: TableColumn<SmartWordRow>[] = [
    {
      key: "word",
      header: t("knowledgeBaseInitWizardModal.wordColumnHeader"),
      render: (row) => (
        <>
          <p className={styles.wizardWordCellPrimary}>
            {row.word} - {row.pinyin}
          </p>
          <p className={styles.wizardWordCellDefinition}>
            ({row.definition})
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="modal-overlay" onClick={resetAndClose}>
      <div
        className={`modal-dialog${step === "smart" ? ` ${styles.kbInitWizardDialogWide}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-init-wizard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="kb-init-wizard-title" className="modal-title">
          {t("knowledgeBaseInitWizardModal.title")}
        </h2>

        {step === "choose" && (
          <>
            <div className={styles.wizardOptionList}>
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.choose.manualOption")}
                onClick={() => setStep("manual-info")}
                className={styles.wizardOptionButton}
              />
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.choose.csvOption")}
                onClick={() => setStep("csv")}
                className={styles.wizardOptionButton}
              />
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.choose.ankiOption")}
                onClick={() => setStep("anki-info")}
                className={styles.wizardOptionButton}
              />
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.choose.smartOption")}
                onClick={startSmartCreation}
                className={styles.wizardOptionButton}
              />
            </div>
            <div className="modal-actions">
              <Button kind="cancel" text={t("actions.close")} onClick={resetAndClose} />
            </div>
          </>
        )}

        {step === "manual-info" && (
          <>
            <p className="modal-message">
              {t("knowledgeBaseInitWizardModal.manualInfo.text")}
            </p>
            <div className="modal-actions">
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.back")}
                onClick={() => setStep("choose")}
              />
              <Button
                kind="confirm"
                text={t("knowledgeBaseInitWizardModal.manualInfo.goToKnowledgeBase")}
                onClick={goToKnowledgeBase}
              />
            </div>
          </>
        )}

        {step === "anki-info" && (
          <>
            <p className="modal-message">
              {t("knowledgeBaseInitWizardModal.ankiInfo.text")}
            </p>
            <div className="modal-actions">
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.back")}
                onClick={() => setStep("choose")}
              />
              <Button
                kind="confirm"
                text={t("knowledgeBaseInitWizardModal.ankiInfo.goToPreferences")}
                onClick={goToPreferences}
              />
            </div>
          </>
        )}

        {step === "csv" && (
          <>
            <p className="modal-message">
              {t("knowledgeBaseInitWizardModal.csv.instructions")}
            </p>
            <div className={tableStyles.tableWrapper}>
              <table className={`${tableStyles.table} ${tableStyles.tableCompact}`}>
                <thead>
                  <tr>
                    <th>word</th>
                    <th>definition</th>
                    <th>pinyin</th>
                    <th>writing_known</th>
                    <th>synchronized</th>
                    <th>updated_at</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>爱好</td>
                    <td>hobby</td>
                    <td>ai4 hao4</td>
                    <td>true</td>
                    <td>false</td>
                    <td>2026-07-12T12:00:00+00:00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="modal-message">
              {t("knowledgeBaseInitWizardModal.csv.headerNote")}
            </p>
            {importError && <p className="table-error">{importError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className={kbPageStyles.knowledgeBaseImportInput}
              onChange={(event) => void handleImport(event)}
            />
            <div className="modal-actions">
              <Button
                kind="cancel"
                text={t("knowledgeBaseInitWizardModal.back")}
                onClick={() => setStep("choose")}
              />
              <Button
                kind="confirm"
                text={t("knowledgeBaseInitWizardModal.csv.import")}
                icon={<ImportIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              />
            </div>
          </>
        )}

        {step === "smart" && (
          <>
            <p className="modal-message">
              {t("knowledgeBaseInitWizardModal.smart.intro")}
            </p>

            {isSmartSetupDone ? (
              <p className="modal-message">
                {t("knowledgeBaseInitWizardModal.smart.setupDone")}
              </p>
            ) : (
              <div className={styles.wizardWordPicker}>
                {candidateWord && (
                  <div className="wizard-word-picker-word">
                    <p className={styles.wizardWordPickerHanzi}>{candidateWord.word}</p>
                    <p className={styles.wizardWordPickerPinyin}>{candidateWord.pinyin}</p>
                    <p className={styles.wizardWordPickerDefinition}>
                      {candidateWord.definition}
                    </p>
                  </div>
                )}
                {isPickingWord && !candidateWord && (
                  <p className="modal-message">
                    {t("knowledgeBaseInitWizardModal.smart.pickingWord")}
                  </p>
                )}
                {pickError && <p className="table-error">{pickError}</p>}
                <div className={styles.wizardWordPickerActions}>
                  <Button
                    kind="cancel"
                    text={t("knowledgeBaseInitWizardModal.smart.dontKnow")}
                    onClick={handleDontKnowWord}
                    disabled={!candidateWord || isPickingWord}
                  />
                  <Button
                    kind="cancel"
                    text={t("knowledgeBaseInitWizardModal.smart.canRecognize")}
                    onClick={handleCanRecognizeWord}
                    disabled={!candidateWord || isPickingWord}
                  />
                  <Button
                    kind="cancel"
                    text={t("knowledgeBaseInitWizardModal.smart.canWrite")}
                    onClick={handleCanWriteWord}
                    disabled={!candidateWord || isPickingWord || hasRecognizedOnly}
                  />
                </div>
              </div>
            )}

            <Table
              columns={smartWordColumns}
              rows={smartWords}
              compact
              maxHeight="500px"
              getRowKey={(row) => row.word}
              emptyMessage={t("knowledgeBaseInitWizardModal.smart.emptyTable")}
              renderRowActions={(row) => (
                <div className={styles.wizardWordRowActions}>
                  <label
                    className="toggle"
                    title={t("knowledgeBaseInitWizardModal.smart.knowToWrite")}
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={t("knowledgeBaseInitWizardModal.smart.knowToWrite")}
                      checked={row.knownToWrite}
                      onChange={() => toggleSmartWordKnownToWrite(row.word)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <Button
                    kind="danger"
                    variant="table"
                    text={t("knowledgeBaseInitWizardModal.smart.remove")}
                    onClick={() => removeSmartWord(row.word)}
                  />
                </div>
              )}
            />

            {smartError && <p className="table-error">{smartError}</p>}

            {syncProgress && (
              <div className={styles.wizardSyncProgress}>
                <progress value={syncProgress.completed} max={syncProgress.total} />
                <span>
                  {t("knowledgeBaseInitWizardModal.smart.syncProgress", {
                    completed: syncProgress.completed,
                    total: syncProgress.total,
                  })}
                </span>
              </div>
            )}
            <div style={{ height: "10px" }} />
            <div className="modal-actions">
              <Button
                kind="cancel"
                text={t("confirmModal.cancel")}
                onClick={() => setStep("choose")}
                disabled={isSmartSubmitting}
              />
              <Button
                kind="confirm"
                text={t("confirmModal.confirm")}
                onClick={() => void confirmSmartCreation()}
                disabled={smartWords.length === 0 || isSmartSubmitting}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
