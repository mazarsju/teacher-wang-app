import { isHanCharacter } from "../knowledgeBase/chineseCharacters";
import type {
  AnkiDeckKind,
  AnkiFieldKey,
  AnkiPendingCard,
  AnkiPendingVocabularyCard,
  AnkiPendingWritingCard,
} from "../../types/anki";
import { versoSignificantPart } from "./ankiHelpers";

export function characterIdsFromVerso(verso: string): string[] {
  return [...versoSignificantPart(verso)].filter(isHanCharacter);
}

export function characterIdsFromWritingCards(
  cards: Array<{ verso: string }>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    for (const charId of characterIdsFromVerso(card.verso)) {
      if (seen.has(charId)) {
        continue;
      }
      seen.add(charId);
      ids.push(charId);
    }
  }
  return ids;
}

export function syncMarkIdsForCards(
  kind: AnkiDeckKind,
  cards: AnkiPendingCard[],
): string[] {
  if (kind === "mandarin_vocabulary") {
    return cards.map((card) => card.id);
  }
  return characterIdsFromWritingCards(cards as AnkiPendingWritingCard[]);
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
