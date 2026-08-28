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

/** User-defined optional field (vocabulary deck only). */
export type AnkiCustomFieldDef = {
  id: string;
  title: string;
  description: string;
  anki_field: string;
};

export type AnkiDeckMapping = {
  status: AnkiDeckStatus;
  deck_name: string;
  model_name: string;
  fields: Partial<Record<AnkiFieldKey, string>>;
  custom_fields: AnkiCustomFieldDef[];
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
      custom_fields: [],
    },
    mandarin_writing: {
      status: "not_configured",
      deck_name: "",
      model_name: "",
      fields: {},
      custom_fields: [],
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
  custom_fields: Record<string, string>;
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
  failed: number | string[];
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

export const ANKI_DECK_ORDER: AnkiDeckKind[] = [
  "mandarin_vocabulary",
  "mandarin_writing",
];

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
