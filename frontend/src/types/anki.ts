export type AnkiDeckKind = "mandarin_vocabulary" | "mandarin_writing";

export type AnkiDeckStatus =
  | "not_configured"
  | "synchronized"
  | "not_synchronized";

export type AnkiOverallSynchronizationStatus =
  | "not_synchronized"
  | "synchronized";

export type AnkiVocabularyFieldKey = "writing" | "pinyin" | "definition";
export type AnkiWritingFieldKey = "recto" | "verso";
export type AnkiFieldKey = AnkiVocabularyFieldKey | AnkiWritingFieldKey;

export type AnkiDeckMapping = {
  status: AnkiDeckStatus;
  deck_name: string;
  model_name: string;
  fields: Partial<Record<AnkiFieldKey, string>>;
};

export type AnkiStatus = {
  connected: boolean;
  synchronization_status: AnkiOverallSynchronizationStatus;
  pending_push_estimate: number;
  decks: Record<AnkiDeckKind, AnkiDeckMapping>;
};

export const emptyAnkiStatus: AnkiStatus = {
  connected: false,
  synchronization_status: "not_synchronized",
  pending_push_estimate: 0,
  decks: {
    mandarin_vocabulary: {
      status: "not_configured",
      deck_name: "",
      model_name: "",
      fields: {},
    },
    mandarin_writing: {
      status: "not_configured",
      deck_name: "",
      model_name: "",
      fields: {},
    },
  },
};

export type AnkiDeckSetupResult = {
  kind: AnkiDeckKind;
  deck: AnkiDeckMapping;
};

export type AnkiPendingVocabularyCard = {
  id: string;
  writing: string;
  pinyin: string;
  definition: string;
  characters_to_create?: string[];
};

export type AnkiPendingWritingCard = {
  id: string;
  recto: string;
  verso: string;
};

export type AnkiPendingCard =
  | AnkiPendingVocabularyCard
  | AnkiPendingWritingCard;

export type AnkiPendingSync = {
  kind: AnkiDeckKind;
  count: number;
  cards: AnkiPendingCard[];
  unsyncable: string[];
  pull_count: number;
  pull_cards: AnkiPendingCard[];
  pull_characters_to_create_count?: number;
  pull_missing?: string[];
  deck: AnkiDeckMapping;
};

export type AnkiSyncAction =
  | "synchronize_all"
  | "cancel_all"
  | "partial";

export type AnkiSyncDirection = "push" | "pull";

export type AnkiSyncResult = {
  kind: AnkiDeckKind;
  action: AnkiSyncAction;
  direction?: AnkiSyncDirection;
  added: number;
  characters_added?: number;
  ignored: number;
  failed: number;
  failed_characters?: string[];
  deck: AnkiDeckMapping;
};

export type AnkiQuickSyncResult = {
  mandarin_vocabulary: AnkiSyncResult;
  mandarin_writing: AnkiSyncResult;
  synchronization_status: AnkiOverallSynchronizationStatus;
  pending_push_estimate: number;
};

export type AnkiLogicalField = {
  key: AnkiFieldKey;
  description: string;
};

export const ANKI_DECK_LABELS: Record<AnkiDeckKind, string> = {
  mandarin_vocabulary: "Mandarin vocabulary",
  mandarin_writing: "Mandarin writing",
};

export const ANKI_DECK_ORDER: AnkiDeckKind[] = [
  "mandarin_vocabulary",
  "mandarin_writing",
];

export const ANKI_DECK_DESCRIPTIONS: Record<AnkiDeckKind, string> = {
  mandarin_writing:
    "This deck is for practicing writing only. It asks you to guess the characters from the definition and pinyin. Only characters with “written known” ticked will be part of this deck.",
  mandarin_vocabulary:
    "This deck is the main deck for practicing vocabulary. It either asks you to guess the character from the pinyin and definition, or the pinyin from the character and definition, or the definition from the character and pinyin.",
};

export const ANKI_REQUIRED_FIELDS: Record<AnkiDeckKind, AnkiLogicalField[]> = {
  mandarin_writing: [
    {
      key: "recto",
      description: 'having the syntax "definition (pinyin)"',
    },
    {
      key: "verso",
      description: "with the characters",
    },
  ],
  mandarin_vocabulary: [
    {
      key: "writing",
      description: "where you set the chinese characters",
    },
    {
      key: "pinyin",
      description: "for the pronunciation",
    },
    {
      key: "definition",
      description: "short definition of the word to be able to guess it",
    },
  ],
};
