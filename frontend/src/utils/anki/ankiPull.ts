import { isHanCharacter } from "../knowledgeBase/chineseCharacters";
import { extractToneSyllablesInOrder } from "../knowledgeBase/wordCharacters";
import { normalizeAnkiPinyinToken } from "../../types/pinyin";
import type {
  AnkiPendingVocabularyCard,
  AnkiPendingWritingCard,
} from "../../types/anki";
import { versoSignificantPart } from "./ankiHelpers";

export type SyncDataCharacter = {
  char: string;
  pinyin: string;
  writing_known: boolean;
  synchronized: boolean;
};

export function pairWritingWithPinyinTokens(
  wordText: string,
  pinyinField: string,
): Array<[string, string | null]> {
  const tokens = pinyinField.split(/\s+/).filter((token) => token !== "");
  const pairs: Array<[string, string | null]> = [];
  let tokenIdx = 0;
  for (const char of wordText) {
    if (!isHanCharacter(char)) {
      continue;
    }
    const raw = tokenIdx < tokens.length ? tokens[tokenIdx] : "";
    tokenIdx += 1;
    const normalized = raw ? normalizeAnkiPinyinToken(raw) : null;
    pairs.push([char, normalized]);
  }
  return pairs;
}

/**
 * Same fallback as `AddWordModal`'s `buildPinyinFromCharacterMap`: when a
 * card's pinyin field doesn't cover a character, guess it from the HSK
 * master reading rather than leaving it unresolved.
 */
function resolvedCharPinyin(
  cardPinyin: string | null,
  char: string,
  hskCharacterPinyin: Record<string, string>,
): string | null {
  if (cardPinyin !== null && cardPinyin.length <= 8) {
    return cardPinyin;
  }
  const guessed = hskCharacterPinyin[char];
  if (guessed !== undefined && guessed.length <= 8) {
    return guessed;
  }
  return null;
}

export function charactersToCreateForCard(
  wordText: string,
  pinyinField: string,
  characterByChar: Map<string, SyncDataCharacter>,
  hskCharacterPinyin: Record<string, string>,
): string[] | null {
  const pinyinBlank = pinyinField.trim() === "";
  const characters = [...wordText];
  const hanChars = characters.filter(isHanCharacter);
  const hasNonHan = hanChars.length < characters.length;

  // Real Anki fields routinely glue non-Han punctuation directly onto the
  // neighboring syllable ("...hao3", "(gong1)"), which the whitespace-token
  // pairing below can't line up with the word's non-Han positions. Try the
  // relaxed scan first for that case; fall back below when it can't fully
  // resolve (e.g. a genuinely new character needing an HSK guess).
  if (hasNonHan && !pinyinBlank) {
    const scanned = extractToneSyllablesInOrder(pinyinField, hanChars.length);
    if (scanned !== null) {
      return hanChars.filter((char) => !characterByChar.has(char));
    }
  }

  const toCreate: string[] = [];
  for (const [char, cardPinyin] of pairWritingWithPinyinTokens(
    wordText,
    pinyinField,
  )) {
    if (characterByChar.has(char)) {
      continue;
    }
    const pinyin = resolvedCharPinyin(cardPinyin, char, hskCharacterPinyin);
    if (pinyin === null) {
      if (pinyinBlank) {
        continue;
      }
      return null;
    }
    toCreate.push(char);
  }
  return toCreate;
}

export function uniqueCharactersToCreate(
  cards: AnkiPendingVocabularyCard[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const card of cards) {
    for (const char of card.characters_to_create ?? []) {
      if (seen.has(char)) {
        continue;
      }
      seen.add(char);
      ordered.push(char);
    }
  }
  return ordered;
}

export function vocabularyPullCardsFromNotes(
  notes: Array<Record<string, string>>,
  localWords: Set<string>,
  ignored: Set<string>,
  characterByChar: Map<string, SyncDataCharacter>,
  hskCharacterPinyin: Record<string, string> = {},
): {
  cards: AnkiPendingVocabularyCard[];
  missing: string[];
  autoIgnore: string[];
} {
  const cards: AnkiPendingVocabularyCard[] = [];
  const missing: string[] = [];
  const autoIgnore: string[] = [];
  const seen = new Set<string>();
  const seenMissing = new Set<string>();

  for (const note of notes) {
    const writing = (note.writing ?? "").trim();
    if (
      writing === "" ||
      localWords.has(writing) ||
      ignored.has(writing) ||
      seen.has(writing) ||
      seenMissing.has(writing)
    ) {
      continue;
    }
    if (writing.length > 10) {
      autoIgnore.push(writing);
      continue;
    }
    const hanChars = [...writing].filter(isHanCharacter);
    if (hanChars.length === 0) {
      continue;
    }
    const pinyin = (note.pinyin ?? "").trim();
    const charactersToCreate = charactersToCreateForCard(
      writing,
      pinyin,
      characterByChar,
      hskCharacterPinyin,
    );
    if (charactersToCreate === null) {
      seenMissing.add(writing);
      missing.push(writing);
      continue;
    }
    seen.add(writing);
    const definition = (note.definition ?? "").trim().slice(0, 100);
    cards.push({
      id: writing,
      writing,
      pinyin,
      definition,
      characters_to_create: charactersToCreate,
    });
  }

  cards.sort((a, b) => a.writing.localeCompare(b.writing));
  missing.sort();
  return { cards, missing, autoIgnore };
}

export function writingPullFromNotes(
  notes: Array<Record<string, string>>,
  ignored: Set<string>,
  characterByChar: Map<string, SyncDataCharacter>,
): {
  pullCards: AnkiPendingWritingCard[];
  missing: string[];
  warningRectos: string[];
} {
  const pullCards: AnkiPendingWritingCard[] = [];
  const missing: string[] = [];
  const warningRectos: string[] = [];
  const seenPull = new Set<string>();
  const seenMissing = new Set<string>();
  const seenWarningRecto = new Set<string>();

  for (const note of notes) {
    const recto = (note.recto ?? "").trim();
    if (recto === "" || ignored.has(recto)) {
      continue;
    }
    const verso = versoSignificantPart(note.verso ?? "");
    let noteHasMissing = false;
    for (const char of verso) {
      if (!isHanCharacter(char)) {
        continue;
      }
      if (ignored.has(char)) {
        continue;
      }
      const record = characterByChar.get(char);
      if (record === undefined) {
        noteHasMissing = true;
        if (!seenMissing.has(char)) {
          seenMissing.add(char);
          missing.push(char);
        }
        continue;
      }
      if (record.writing_known) {
        continue;
      }
      if (seenPull.has(char)) {
        continue;
      }
      seenPull.add(char);
      pullCards.push({
        id: char,
        recto: record.pinyin,
        verso: char,
        anki_recto: recto,
      });
    }
    if (noteHasMissing && !seenWarningRecto.has(recto)) {
      seenWarningRecto.add(recto);
      warningRectos.push(recto);
    }
  }

  return { pullCards, missing, warningRectos };
}
