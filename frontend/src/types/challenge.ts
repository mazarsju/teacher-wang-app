import type { ChatCharacter } from "../components/ChatCharacterCard";

export type ChallengeTask = {
  id: string;
  label: string;
};

export type Challenge = {
  id: string;
  title: string;
  description: string;
  character: ChatCharacter;
  tasks: ChallengeTask[];
};
