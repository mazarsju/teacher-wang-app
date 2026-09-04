import type { ChatCharacter } from "../components/ChatCharacterCard";

export type ChallengeTask = {
  id: string;
  label: string;
};

export type ChallengeVocabularyWord = {
  id: string;
  word: string;
  pinyin: string;
  definition: string;
};

export type Challenge = {
  id: string;
  title: string;
  description: string;
  character: ChatCharacter;
  tasks: ChallengeTask[];
  vocabulary: ChallengeVocabularyWord[];
  hskLevel: number;
};

export type ChallengeProgressEntry = {
  id: string;
  completed: boolean;
};

export type ChallengeProgressSummary = {
  challenges: ChallengeProgressEntry[];
};
