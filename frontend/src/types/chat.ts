export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  correctionAnswer?: string;
  correctionThreadId?: string;
  correctionThread?: ChatMessage[];
  correctionSeverity?: GrammarSeverity;
  /** Render as background context (no bubble, Markdown) instead of a chat turn. Local display only, stripped before hitting the API. */
  isContext?: boolean;
};

export type ChatRequest = {
  character_id: string;
  messages: ChatMessage[];
  parent_character_id?: string;
  thread_id?: string;
  ephemeral?: boolean;
};

export type GrammarSeverity = "none" | "minor" | "awkward" | "incorrect";

export type GrammarCorrection = {
  severity: GrammarSeverity;
  answer?: string;
  thread_id?: string;
  thread_messages?: ChatMessage[];
};

export type ChatTokenUsage = {
  input: number;
  output: number;
  total: number;
};

export type JudgeConversationMessage = {
  role: "judge" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: ChatMessage;
  unknown_characters?: string[][];
  correction?: GrammarCorrection;
  tokens?: ChatTokenUsage;
  completed_task_ids?: string[];
  judge_conversation?: JudgeConversationMessage[];
};

export type ChatHistoryResponse = {
  messages: ChatMessage[];
  completed_task_ids?: string[];
};

export type ChatThreadContext = {
  parentCharacterId: string;
  threadId: string;
};
