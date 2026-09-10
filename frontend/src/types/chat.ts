export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  correctionAnswer?: string;
  correctionThreadId?: string;
  correctionThread?: ChatMessage[];
  correctionSeverity?: GrammarSeverity;
  /** Render as background context (no bubble, Markdown) instead of a chat turn. Local display only, stripped before hitting the API. */
  isContext?: boolean;
  /** For isContext messages: Markdown shown instead of `content`. `content` still goes to the API; this does not. */
  displayContent?: string;
  /** Shown normally in the transcript but never sent to the API (e.g. a scripted greeting). */
  isDisplayOnly?: boolean;
};

export type ChatRequest = {
  character_id: string;
  messages: ChatMessage[];
  parent_character_id?: string;
  thread_id?: string;
  ephemeral?: boolean;
  context?: string;
};

export type GrammarSeverity = "none" | "minor" | "awkward" | "incorrect";

export type OpenAiTtsVoiceName =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

// ElevenLabs voices for the "realistic voice" pro feature. Most of ElevenLabs'
// voice library requires a paid ElevenLabs plan to use via the API — these
// are every default voice confirmed (by a real API call) to work on a
// free-tier key, randomly distributed one-per-character by gender. Keep in
// sync with ELEVENLABS_VOICE_IDS in backend/utils/aiChat/elevenlabs_client.py.
export type ElevenLabsVoiceName =
  | "sarah"
  | "laura"
  | "alice"
  | "matilda"
  | "jessica"
  | "lily"
  | "roger"
  | "charlie"
  | "george"
  | "callum"
  | "liam"
  | "will"
  | "eric"
  | "chris"
  | "brian"
  | "daniel"
  | "antoni"
  | "arnold"
  | "adam";

/**
 * A character speaks with one voice per TTS provider. `/chat/tts` receives
 * both options and picks the one matching the caller's resolved provider
 * (plan + realistic-voice preference) — the client never decides which
 * provider is used.
 */
export type CharacterVoiceOption =
  | { provider: "chatgpt"; name: OpenAiTtsVoiceName }
  | { provider: "elevenlabs"; name: ElevenLabsVoiceName };

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
