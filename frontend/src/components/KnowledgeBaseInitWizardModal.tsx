import { useRef, useState, type ChangeEvent } from "react";
import type { PageId } from "./Navbar";
import Table, { type TableColumn } from "./Table";
import { ImportIcon } from "./icons";
import { useAppDispatch } from "../store/hooks";
import { syncAppData } from "../store/thunks/syncAppData";
import type { HskWord } from "../types/hskWord";
import {
  buildImportFileContent,
  type SmartWordRow,
} from "../utils/knowledgeBase/buildImportLines";
import { pickNextHskWord } from "../utils/knowledgeBase/hskWordsApi";
import { importDatabase } from "../utils/knowledgeBase/knowledgeBaseApi";

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
  const [isPickingWord, setIsPickingWord] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [seenWords, setSeenWords] = useState<string[]>([]);
  const [smartWords, setSmartWords] = useState<SmartWordRow[]>([]);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [isSmartSubmitting, setIsSmartSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  function resetAndClose() {
    setStep("choose");
    setImportError(null);
    setCandidateWord(null);
    setSeenWords([]);
    setSmartWords([]);
    setSmartError(null);
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

  async function loadNextWord(exclude: string[]) {
    setIsPickingWord(true);
    setPickError(null);

    try {
      setCandidateWord(await pickNextHskWord(exclude));
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
    setStep("smart");
    void loadNextWord([]);
  }

  function recordWordPick(row: SmartWordRow | null) {
    if (!candidateWord || isPickingWord) {
      return;
    }

    if (seenWords.includes(candidateWord.word)) {
      // Already recorded (e.g. retrying after a failed pick) — just retry
      // loading the next word instead of recording it twice.
      void loadNextWord(seenWords);
      return;
    }

    const nextSeen = [...seenWords, candidateWord.word];
    setSeenWords(nextSeen);
    if (row) {
      setSmartWords((previous) => [...previous, row]);
    }
    // Keep showing this word (and its picked state) until the next one is
    // ready, so Part 2 doesn't collapse and jump between picks.
    void loadNextWord(nextSeen);
  }

  function handleDontKnowWord() {
    recordWordPick(null);
  }

  function handleCanRecognizeWord() {
    if (!candidateWord) {
      return;
    }
    recordWordPick({
      word: candidateWord.word,
      pinyin: candidateWord.pinyin,
      definition: candidateWord.definition,
      knownToWrite: false,
    });
  }

  function handleCanWriteWord() {
    if (!candidateWord) {
      return;
    }
    recordWordPick({
      word: candidateWord.word,
      pinyin: candidateWord.pinyin,
      definition: candidateWord.definition,
      knownToWrite: true,
    });
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

    try {
      const file = new File(
        [buildImportFileContent(smartWords)],
        "smart-creation.txt",
        { type: "text/plain" },
      );
      await importDatabase(file);
      await dispatch(syncAppData()).unwrap();
      resetAndClose();
    } catch (error) {
      setSmartError(
        error instanceof Error
          ? error.message
          : "Failed to save your knowledge base.",
      );
      setIsSmartSubmitting(false);
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
              {!isPickingWord && !pickError && !candidateWord && (
                <p className="modal-message">
                  No more words available right now.
                </p>
              )}
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
                  disabled={!candidateWord || isPickingWord}
                >
                  Can write it
                </button>
              </div>
            </div>

            <Table
              columns={smartWordColumns}
              rows={smartWords}
              compact
              maxVisibleRows={5}
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

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={() => setStep("choose")}
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
