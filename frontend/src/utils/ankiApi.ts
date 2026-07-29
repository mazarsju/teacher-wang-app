/**
 * Public Anki API facade used by Preferences / Knowledge Base / modals.
 * AnkiConnect calls and sync orchestration live in ankiSync.ts / ankiConnect.ts.
 */

export {
  autoSetupVocabularyDeck,
  fetchAnkiDecks,
  fetchAnkiModelFields,
  fetchAnkiModels,
  fetchAnkiPendingSync,
  fetchAnkiStatus,
  runAnkiQuickSync,
  runAnkiSync,
  setupAnkiDeck,
} from "./ankiSync";
