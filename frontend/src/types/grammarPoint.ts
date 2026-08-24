import type { HskWord } from "./hskWord";

export type GrammarPoint = {
  id: string;
  hsk_level: number;
  index: number;
  title: string;
  prerequisites: string[];
  status: string;
  score: number | null;
};

export type MultipleChoiceExercise = {
  id: string;
  type: "multiple_choice";
  question: string;
  choices: string[];
  answer: number;
};

export type SentenceReorderingExercise = {
  id: string;
  type: "sentence_reordering";
  tokens: string[];
  answer: string[];
};

export type TransformExercise = {
  id: string;
  type: "transform";
  source: string;
  instruction?: string;
  accepted_answers: string[];
};

export type TranslationExercise = {
  id: string;
  type: "translation";
  prompt: string;
  accepted_answers: string[];
};

export type GrammarExercise =
  | MultipleChoiceExercise
  | SentenceReorderingExercise
  | TransformExercise
  | TranslationExercise;

export type GrammarPointDetail = GrammarPoint & {
  explanation: string | null;
  exercises: GrammarExercise[] | null;
  new_words: HskWord[];
};
