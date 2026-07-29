export type Character = {
  char: string;
  pinyin: string;
  writting_known: boolean;
  updated_at: string;
};

export { isValidCharacter } from "../utils/knowledgeBase/chineseCharacters";
