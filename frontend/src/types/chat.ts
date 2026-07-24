export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  correctionAnswer?: string;
  correctionThreadId?: string;
  correctionThread?: ChatMessage[];
};

export type ChatRequest = {
  character_id: string;
  messages: ChatMessage[];
  parent_character_id?: string;
  thread_id?: string;
};

export type GrammarCorrection = {
  correct: boolean;
  answer?: string;
  thread_id?: string;
  thread_messages?: ChatMessage[];
};

export type ChatTokenUsage = {
  input: number;
  output: number;
  total: number;
};

export type ChatResponse = {
  message: ChatMessage;
  unknown_characters?: string[][];
  correction?: GrammarCorrection;
  tokens?: ChatTokenUsage;
};

export type ChatHistoryResponse = {
  messages: ChatMessage[];
};

export type ChatThreadContext = {
  parentCharacterId: string;
  threadId: string;
};
