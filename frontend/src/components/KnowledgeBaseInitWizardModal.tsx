import { useRef, useState, type ChangeEvent } from "react";
import type { PageId } from "./Navbar";
import Table, { type TableColumn } from "./Table";
import { ImportIcon } from "./icons";
import { useAppDispatch } from "../store/hooks";
import { syncAppData } from "../store/thunks/syncAppData";
import type { HskWord } from "../types/hskWord";
import {
  extractCharacterEntries,
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
          : "Failed to import your knowledge base.",
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
        error instanceof Error ? error.message : "Failed to pick a word.",
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
        error instanceof Error ? error.message : "Failed to pick a word.",
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
        error instanceof Error ? error.message : "Failed to pick a word.",
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
        pinyin: row.pinyin.trim() || null,
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
          : "Failed to save your knowledge base.",
      );
      setIsSmartSubmitting(false);
    } finally {
      setSyncProgress(null);
    }
  }

  const smartWordColumns: TableColumn<SmartWordRow>[] = [
    { key: "word", header: "Word" },
    { key: "pinyin", header: "Pinyin" },
    { key: "definition", header: "Definition" },
    {
      key: "knownToWrite",
      header: "Know to write it",
      render: (row) => (
        <label className="toggle">
          <input
            type="checkbox"
            role="switch"
            checked={row.knownToWrite}
            onChange={() => toggleSmartWordKnownToWrite(row.word)}
          />
          <span className="toggle-slider" />
        </label>
      ),
    },
  ];

  return (
    <div className="modal-overlay" onClick={resetAndClose}>
      <div
        className={`modal-dialog${step === "smart" ? " kb-init-wizard-dialog--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-init-wizard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="kb-init-wizard-title" className="modal-title">
          Build your knowledge base
        </h2>

        {step === "choose" && (
          <>
            <div className="wizard-option-list">
              <button
                type="button"
                className="wizard-option-button"
                onClick={() => setStep("manual-info")}
              >
                Add characters and words one by one, manually
              </button>
              <button
                type="button"
                className="wizard-option-button"
                onClick={() => setStep("csv")}
              >
                Upload an existing knowledge base (CSV)
              </button>
              <button
                type="button"
                className="wizard-option-button"
                onClick={() => setStep("anki-info")}
              >
                Import data from an Anki deck
              </button>
              <button
                type="button"
                className="wizard-option-button"
                onClick={startSmartCreation}
              >
                Smart creation based on what you already know
              </button>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={resetAndClose}
              >
                Close
              </button>
            </div>
          </>
        )}

        {step === "manual-info" && (
          <>
            <p className="modal-message">
              You should go to the Knowledge base section for that and
              manually create what you want.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={() => setStep("choose")}
              >
                Back
              </button>
              <button
                type="button"
                className="modal-button-confirm-primary"
                onClick={goToKnowledgeBase}
              >
                Go to Knowledge base
              </button>
            </div>
          </>
        )}

        {step === "anki-info" && (
          <>
            <p className="modal-message">
              You can setup your Anki synchronization in the Preference
              section.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={() => setStep("choose")}
              >
                Back
              </button>
              <button
                type="button"
                className="modal-button-confirm-primary"
                onClick={goToPreferences}
              >
                Go to Preferences
              </button>
            </div>
          </>
        )}

        {step === "csv" && (
          <>
            <p className="modal-message">
              Upload a text file with one character per line. Each line
              lists, separated by semicolons: the character, its pinyin, the
              tone, whether you already know how to write it (true or
              false), and example words or short sentences where the
              character appears, separated by commas. For example:
            </p>
            <div className="table-wrapper">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>character</th>
                    <th>pinyin</th>
                    <th>tone</th>
                    <th>known</th>
                    <th>examples</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>爱</td>
                    <td>ai</td>
                    <td>4</td>
                    <td>true</td>
                    <td>可爱, 我爱学习, 我爱生气, 爱, 爱好, 爱情, 相爱</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="modal-message">
              The column names shown above are just for illustration — they
              are not required in the file itself.
            </p>
            {importError && <p className="table-error">{importError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="knowledge-base-import-input"
              onChange={(event) => void handleImport(event)}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={() => setStep("choose")}
              >
                Back
              </button>
              <button
                type="button"
                className="modal-button-confirm-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                <ImportIcon className="page-mode-button-icon" />
                Import
              </button>
            </div>
          </>
        )}

        {step === "smart" && (
          <>
            <p className="modal-message">
              Tell us whether you know each word below and whether you can
              write all of its characters. You can review the full list of
              words you are about to add at any moment before confirming.
            </p>

            {isSmartSetupDone ? (
              <p className="modal-message">
                Your quick setup is done! Please review the list below.
              </p>
            ) : (
              <div className="wizard-word-picker">
                {candidateWord && (
                  <div className="wizard-word-picker-word">
                    <p className="wizard-word-picker-hanzi">{candidateWord.word}</p>
                    <p className="wizard-word-picker-pinyin">{candidateWord.pinyin}</p>
                    <p className="wizard-word-picker-definition">
                      {candidateWord.definition}
                    </p>
                  </div>
                )}
                {isPickingWord && !candidateWord && (
                  <p className="modal-message">Picking a word…</p>
                )}
                {pickError && <p className="table-error">{pickError}</p>}
                <div className="wizard-word-picker-actions">
                  <button
                    type="button"
                    className="modal-button-cancel"
                    onClick={handleDontKnowWord}
                    disabled={!candidateWord || isPickingWord}
                  >
                    Don't know it
                  </button>
                  <button
                    type="button"
                    className="modal-button-confirm"
                    onClick={handleCanRecognizeWord}
                    disabled={!candidateWord || isPickingWord}
                  >
                    Can recognize it
                  </button>
                  <button
                    type="button"
                    className="modal-button-confirm-primary"
                    onClick={handleCanWriteWord}
                    disabled={!candidateWord || isPickingWord || hasRecognizedOnly}
                  >
                    Can write it
                  </button>
                </div>
              </div>
            )}

            <Table
              columns={smartWordColumns}
              rows={smartWords}
              compact
              getRowKey={(row) => row.word}
              emptyMessage="No words picked yet."
              renderRowActions={(row) => (
                <button
                  type="button"
                  className="table-delete-button"
                  onClick={() => removeSmartWord(row.word)}
                >
                  Remove
                </button>
              )}
            />

            {smartError && <p className="table-error">{smartError}</p>}

            {syncProgress && (
              <div className="wizard-sync-progress">
                <progress value={syncProgress.completed} max={syncProgress.total} />
                <span>
                  Syncing your knowledge base… {syncProgress.completed}/
                  {syncProgress.total}
                </span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={() => setStep("choose")}
                disabled={isSmartSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button-confirm-primary"
                onClick={() => void confirmSmartCreation()}
                disabled={smartWords.length === 0 || isSmartSubmitting}
              >
                Confirm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
