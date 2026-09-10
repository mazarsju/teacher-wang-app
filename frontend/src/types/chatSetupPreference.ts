export type ChatListeningMode = "reading_first" | "listening_first";

export type ChatListenSpeedAdjustment = -20 | -10 | 0 | 10 | 20;

export type ChatSetupPreference = {
  listening_mode: ChatListeningMode;
  listen_speed_adjustment: ChatListenSpeedAdjustment;
  /** Pro-only: OpenAI vs. ElevenLabs voice for chat TTS. Server-enforced — see /chat/tts. */
  realistic_voice_enabled: boolean;
};
