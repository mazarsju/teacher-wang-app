export type Word = {
  word: string;
  definition: string | null;
  pinyin: string | null;
  writing_known: boolean;
  custom_fields: Record<string, string>;
  updated_at: string;
  characters: string[];
};
