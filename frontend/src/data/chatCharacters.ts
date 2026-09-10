import type { TFunction } from "i18next";
import type { ChatCharacter } from "../components/ChatCharacterCard";
import type { CharacterVoiceOption } from "../types/chat";

export const TEACHER_WANG_ID = "teacher-wang";
export const XIAO_MING_ID = "xiao-ming";

type ChatCharacterTemplate = {
  id: string;
  name: string;
  chineseName: string;
  translationKey: string;
  avatarVariant: ChatCharacter["avatarVariant"];
  gender: ChatCharacter["gender"];
  voice: CharacterVoiceOption[];
};

// `name`/`chineseName`/`avatarVariant`/`gender`/`voice` are stable,
// deliberately untranslated data (see docs/adr/frontend-localization.md's
// "Out of scope" note) — only `description` resolves into
// locales/en/chat.json's `chatCharacters` key, via
// `getTeacherWang`/`getXiaoMing`/`getChatCharacters`.
const TEACHER_WANG_TEMPLATE: ChatCharacterTemplate = {
  id: TEACHER_WANG_ID,
  name: "Teacher Wang",
  chineseName: "王老师",
  translationKey: "teacherWang",
  avatarVariant: "teacher",
  gender: "male",
  voice: [
    { provider: "chatgpt", name: "alloy" },
    { provider: "elevenlabs", name: "antoni" },
  ],
};

const XIAO_MING_TEMPLATE: ChatCharacterTemplate = {
  id: XIAO_MING_ID,
  name: "Xiao Ming",
  chineseName: "小明",
  translationKey: "xiaoMing",
  avatarVariant: "friend",
  gender: "male",
  voice: [
    { provider: "chatgpt", name: "echo" },
    { provider: "elevenlabs", name: "chris" },
  ],
};

function renderChatCharacter(
  template: ChatCharacterTemplate,
  t: TFunction<"chat">,
): ChatCharacter {
  return {
    id: template.id,
    name: template.name,
    chineseName: template.chineseName,
    description: t(`chatCharacters.${template.translationKey}.description`),
    avatarVariant: template.avatarVariant,
    gender: template.gender,
    voice: template.voice,
  };
}

export function getTeacherWang(t: TFunction<"chat">): ChatCharacter {
  return renderChatCharacter(TEACHER_WANG_TEMPLATE, t);
}

export function getXiaoMing(t: TFunction<"chat">): ChatCharacter {
  return renderChatCharacter(XIAO_MING_TEMPLATE, t);
}

/** Both chat characters, rendered in the caller's language via `useTranslation("chat")`. */
export function getChatCharacters(t: TFunction<"chat">): ChatCharacter[] {
  return [getTeacherWang(t), getXiaoMing(t)];
}
