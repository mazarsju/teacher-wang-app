import type { TFunction } from "i18next";
import type { ChatCharacter } from "../components/ChatCharacterCard";
import type { Challenge } from "../types/challenge";

export const NEW_FRIEND_CHALLENGE_ID = "challenge-new-friend";

type ChallengeTaskTemplate = { id: string; key: string };

type ChallengeTemplate = {
  id: string;
  translationKey: string;
  character: {
    id: string;
    chineseName: string;
    avatarVariant: ChatCharacter["avatarVariant"];
  };
  tasks: ChallengeTaskTemplate[];
  hskLevel: number;
};

// The `id`/`chineseName`/`avatarVariant`/task `id`s and this order are stable
// data (used as React keys, completion-progress ids, and avatar lookups) —
// only translationKey/key resolve into locales/en/challenge.json via
// `getChallenges()`. Keep this array's order in sync with challenge.json.
const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: NEW_FRIEND_CHALLENGE_ID,
    translationKey: "newFriend",
    character: {
      id: NEW_FRIEND_CHALLENGE_ID,
      chineseName: "小明",
      avatarVariant: "friend",
    },
    tasks: [
      { id: "greet-friend", key: "greetFriend" },
      { id: "introduce-name", key: "introduceName" },
      { id: "say-age", key: "sayAge" },
    ],
    hskLevel: 0,
  },
  {
    id: "challenge-restaurant",
    translationKey: "restaurant",
    character: {
      id: "challenge-restaurant",
      chineseName: "服务员",
      avatarVariant: "waiter",
    },
    tasks: [
      { id: "call-waiter", key: "callWaiter" },
      { id: "ask-no-meat", key: "askNoMeat" },
      { id: "ask-bill", key: "askBill" },
      { id: "pay-bill", key: "payBill" },
    ],
    hskLevel: 2,
  },
  {
    id: "challenge-taxi",
    translationKey: "taxi",
    character: {
      id: "challenge-taxi",
      chineseName: "出租车司机",
      avatarVariant: "taxi-driver",
    },
    tasks: [
      { id: "hail-taxi", key: "hailTaxi" },
      { id: "give-destination", key: "giveDestination" },
      { id: "ask-fare", key: "askFare" },
      { id: "pay-fare", key: "payFare" },
    ],
    hskLevel: 2,
  },
  {
    id: "challenge-hotel",
    translationKey: "hotel",
    character: {
      id: "challenge-hotel",
      chineseName: "前台",
      avatarVariant: "hotel-receptionist",
    },
    tasks: [
      { id: "greet-receptionist", key: "greetReceptionist" },
      { id: "check-in", key: "checkIn" },
      { id: "ask-breakfast", key: "askBreakfast" },
      { id: "check-out", key: "checkOut" },
    ],
    hskLevel: 2,
  },
  {
    id: "challenge-shop",
    translationKey: "shop",
    character: {
      id: "challenge-shop",
      chineseName: "售货员",
      avatarVariant: "shop-assistant",
    },
    tasks: [
      { id: "greet-assistant", key: "greetAssistant" },
      { id: "ask-price", key: "askPrice" },
      { id: "ask-different-size", key: "askDifferentSize" },
      { id: "pay-item", key: "payItem" },
    ],
    hskLevel: 2,
  },
];

function renderChallenge(
  template: ChallengeTemplate,
  t: TFunction<"challenge">,
): Challenge {
  return {
    id: template.id,
    title: t(`${template.translationKey}.title`),
    description: t(`${template.translationKey}.description`),
    character: {
      id: template.character.id,
      name: t(`${template.translationKey}.character.name`),
      chineseName: template.character.chineseName,
      description: t(`${template.translationKey}.character.description`),
      avatarVariant: template.character.avatarVariant,
    },
    tasks: template.tasks.map((task) => ({
      id: task.id,
      label: t(`${template.translationKey}.tasks.${task.key}`),
    })),
    hskLevel: template.hskLevel,
  };
}

/** All challenges, rendered in the caller's language via `useTranslation("challenge")`. */
export function getChallenges(t: TFunction<"challenge">): Challenge[] {
  return CHALLENGE_TEMPLATES.map((template) => renderChallenge(template, t));
}
