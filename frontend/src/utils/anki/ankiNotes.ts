import type {
  AnkiCustomFieldDef,
  AnkiDeckKind,
  AnkiFieldKey,
  AnkiPendingCard,
  AnkiPendingVocabularyCard,
  AnkiPendingWritingCard,
} from "../../types/anki";
import { versoSignificantPart } from "./ankiHelpers";

export function syncMarkIdsForCards(
  _kind: AnkiDeckKind,
  cards: AnkiPendingCard[],
): string[] {
  return cards.map((card) => card.id);
}

export function significantAnkiVersos(versos: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const verso of versos) {
    const part = versoSignificantPart(verso).trim();
    if (part !== "") {
      result.add(part);
    }
  }
  return result;
}

export function buildAnkiNotes(options: {
  kind: AnkiDeckKind;
  deckName: string;
  modelName: string;
  fieldMap: Partial<Record<AnkiFieldKey, string>>;
  customFields?: AnkiCustomFieldDef[];
  cards: AnkiPendingCard[];
}): Array<Record<string, unknown>> {
  const notes: Array<Record<string, unknown>> = [];
  for (const card of options.cards) {
    let ankiFields: Record<string, string>;
    if (options.kind === "mandarin_vocabulary") {
      const vocab = card as AnkiPendingVocabularyCard;
      ankiFields = {
        [options.fieldMap.writing ?? ""]: vocab.writing,
        [options.fieldMap.pinyin ?? ""]: vocab.pinyin,
        [options.fieldMap.definition ?? ""]: vocab.definition,
      };
      for (const field of options.customFields ?? []) {
        if (field.anki_field.trim() === "") {
          continue;
        }
        ankiFields[field.anki_field] = vocab.custom_fields?.[field.id] ?? "";
      }
    } else {
      const writing = card as AnkiPendingWritingCard;
      ankiFields = {
        [options.fieldMap.recto ?? ""]: writing.recto,
        [options.fieldMap.verso ?? ""]: writing.verso,
      };
    }
    notes.push({
      deckName: options.deckName,
      modelName: options.modelName,
      fields: ankiFields,
      options: { allowDuplicate: false },
      tags: ["teacher-wang"],
    });
  }
  return notes;
}
