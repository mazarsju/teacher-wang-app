/**
 * Public Anki API facade used by Preferences / Knowledge Base / modals.
 */

export {
  fetchAnkiPendingSync,
  fetchAnkiStatus,
  runAnkiQuickSync,
  runAnkiSync,
} from "./ankiSync";

export {
  autoSetupVocabularyDeck,
  fetchAnkiDecks,
  fetchAnkiModelFields,
  fetchAnkiModels,
  setupAnkiDeck,
} from "./ankiSetup";
