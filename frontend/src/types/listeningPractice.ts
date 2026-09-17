import type { WritingSentenceCheck } from "./writingSentence";

export type ListeningPractice = {
  id: string;
  title: string;
  hsk_level: number;
  type: string;
  topic: string;
  translated_topic: string;
  status: string;
  vocabulary_score: number;
  grammar_score: number;
};

export type ListeningChunk = {
  id: number;
  mandarin: string;
};

export type ListeningSentence = {
  id: number;
  mandarin: string;
  translation: string;
  speaker: string;
  chunks?: ListeningChunk[];
};

export type ListeningExercise = {
  id: string;
  type: "multiple_choice";
  question: string;
  choices: string[];
  answer: number;
};

export type ListeningShadowingAnswer = {
  text: string;
  result: "correct" | "incorrect";
};

/** The learner's answers on a topic's Questions/Shadowing/Bonus sections —
 * saved wholesale on every Verify/Check/Submit click, restored on load. */
export type ListeningProgressData = {
  exercises: Record<string, number>;
  shadowing: Record<string, ListeningShadowingAnswer>;
  bonus: WritingSentenceCheck[] | null;
};

export type ListeningPracticeDetail = ListeningPractice & {
  text: string;
  sentences: ListeningSentence[];
  exercises: ListeningExercise[];
  bonus_question: string | null;
  progress: ListeningProgressData | null;
  segment_ids: number[];
  man_name: string | null;
  woman_name: string | null;
};

export type CompleteListeningPracticeResult = {
  status: string;
  vocabulary_score: number;
  grammar_score: number;
};

export type ListeningPracticeCatalogEntry = Pick<
  ListeningPractice,
  "id" | "title" | "hsk_level" | "type" | "topic" | "translated_topic"
>;

export type ListeningPracticeLevelEntry = Pick<
  ListeningPractice,
  "id" | "status" | "vocabulary_score" | "grammar_score"
>;
