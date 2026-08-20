export type GrammarPoint = {
  id: string;
  hsk_level: number;
  title: string;
  prerequisites: string[];
  status: string;
};

export type GrammarExercise = Record<string, unknown>;

export type GrammarPointDetail = GrammarPoint & {
  explanation: string | null;
  exercises: GrammarExercise[] | null;
};
