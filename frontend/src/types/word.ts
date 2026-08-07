export type Word = {
  word: string;
  definition: string | null;
  pinyin: string | null;
  writing_known: boolean;
  updated_at: string;
  characters: string[];
};
