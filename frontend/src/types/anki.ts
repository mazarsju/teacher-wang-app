export type AnkiDeckKind = "mandarin_vocabulary" | "mandarin_writting";

export type AnkiDeckStatus =
  | "not_configured"
  | "synchronized"
  | "not_synchronized";

export type AnkiVocabularyFieldKey = "writting" | "pinyin" | "definition";
export type AnkiWrittingFieldKey = "recto" | "verso";
export type AnkiFieldKey = AnkiVocabularyFieldKey | AnkiWrittingFieldKey;

export type AnkiDeckMapping = {
  status: AnkiDeckStatus;
  deck_name: string;
  model_name: string;
  fields: Partial<Record<AnkiFieldKey, string>>;
};

export type AnkiStatus = {
  connected: boolean;
  decks: Record<AnkiDeckKind, AnkiDeckMapping>;
};

export type AnkiDeckSetupResult = {
  kind: AnkiDeckKind;
  deck: AnkiDeckMapping;
};

export type AnkiLogicalField = {
  key: AnkiFieldKey;
  description: string;
};

export const ANKI_DECK_LABELS: Record<AnkiDeckKind, string> = {
  mandarin_vocabulary: "Mandarin vocabulary",
  mandarin_writting: "Mandarin writting",
};

export const ANKI_DECK_ORDER: AnkiDeckKind[] = [
  "mandarin_vocabulary",
  "mandarin_writting",
];

export const ANKI_DECK_DESCRIPTIONS: Record<AnkiDeckKind, string> = {
  mandarin_writting:
    "This deck is for practicing writing only. The only direction is recto → verso. Only characters with “written known” ticked will be part of this deck.",
  mandarin_vocabulary:
    "The Anki note type should support 3 directions: 1) asking writting → guessing pinyin + definition, 2) asking pinyin → guessing writting + definition, 3) asking definition → guessing writting + pinyin.",
};

export const ANKI_REQUIRED_FIELDS: Record<AnkiDeckKind, AnkiLogicalField[]> = {
  mandarin_writting: [
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
      key: "writting",
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
