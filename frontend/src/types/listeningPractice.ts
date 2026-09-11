export type ListeningPractice = {
  id: string;
  title: string;
  hsk_level: number;
  status: string;
  vocabulary_score: number;
  grammar_score: number;
};

export type ListeningSentence = {
  id: number;
  mandarin: string;
  translation: string;
};

export type ListeningPracticeDetail = ListeningPractice & {
  text: string;
  sentences: ListeningSentence[];
  segment_count: number;
};
