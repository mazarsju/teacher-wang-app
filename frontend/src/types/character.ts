export type Character = {
  char: string;
  pinyin: string;
  // All distinct pinyin readings for this character (e.g. 的 → ["de", "di4"]).
  // Optional so existing fixtures/tests that only set `pinyin` keep working;
  // callers that care about variants should fall back to `[pinyin]`.
  pinyin_readings?: string[];
  writing_known: boolean;
  updated_at: string;
};

export { isValidCharacter } from "../utils/knowledgeBase/chineseCharacters";
