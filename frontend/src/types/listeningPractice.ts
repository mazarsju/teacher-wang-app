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
  chunks?: ListeningChunk[];
};

export type ListeningExercise = {
  id: string;
  type: "multiple_choice";
  question: string;
  choices: string[];
  answer: number;
};

export type ListeningPracticeDetail = ListeningPractice & {
  text: string;
  sentences: ListeningSentence[];
  exercises: ListeningExercise[];
  bonus_question: string | null;
  segment_count: number;
};

export type CompleteListeningPracticeResult = {
  status: string;
  vocabulary_score: number;
  grammar_score: number;
};
