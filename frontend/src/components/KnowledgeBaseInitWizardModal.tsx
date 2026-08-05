import { useRef, useState, type ChangeEvent } from "react";
import type { PageId } from "./Navbar";
import { ImportIcon } from "./icons";
import { useAppDispatch } from "../store/hooks";
import { syncAppData } from "../store/thunks/syncAppData";
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
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) {
    return null;
  }

  function resetAndClose() {
    setStep("choose");
    setImportError(null);
    setImportMessage(null);
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
    setImportMessage(null);
    setIsImporting(true);

    try {
      await importDatabase(file);
      await dispatch(syncAppData()).unwrap();
      setImportMessage("Your knowledge base has been imported successfully.");
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Failed to import your knowledge base.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={resetAndClose}>
      <div
        className="modal-dialog"
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
                onClick={() => setStep("smart")}
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
            {importMessage && <p className="modal-message">{importMessage}</p>}
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
            <p className="modal-message">Coming soon.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={() => setStep("choose")}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
