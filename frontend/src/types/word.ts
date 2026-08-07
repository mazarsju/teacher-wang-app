export type Word = {
  word: string;
  definition: string | null;
  pinyin: string | null;
  writting_known: boolean;
  updated_at: string;
  characters: string[];
};
