import type { TFunction } from "i18next";
import type { ChatCharacter } from "../components/ChatCharacterCard";
import type { Challenge } from "../types/challenge";

export const NEW_FRIEND_CHALLENGE_ID = "challenge-new-friend";

type ChallengeTaskTemplate = { id: string; key: string };

type ChallengeVocabularyTemplate = { id: string; word: string; pinyin: string; key: string };

type ChallengeTemplate = {
  id: string;
  translationKey: string;
  character: {
    id: string;
    chineseName: string;
    avatarVariant: ChatCharacter["avatarVariant"];
  };
  tasks: ChallengeTaskTemplate[];
  vocabulary: ChallengeVocabularyTemplate[];
  hskLevel: number;
};

// The `id`/`chineseName`/`avatarVariant`/task `id`s/vocabulary `word`+`pinyin`
// and this order are stable data (used as React keys, completion-progress
// ids, and avatar lookups) — only translationKey/key resolve into
// locales/en/challenge.json via `getChallenges()`. Keep this array's order in
// sync with challenge.json.
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
    vocabulary: [
      { id: "ni-hao", word: "你好", pinyin: "ni3 hao3", key: "niHao" },
      { id: "jiao", word: "叫", pinyin: "jiao4", key: "jiao" },
      { id: "mingzi", word: "名字", pinyin: "ming2 zi5", key: "mingzi" },
      { id: "sui", word: "岁", pinyin: "sui4", key: "sui" },
      { id: "renshi", word: "认识", pinyin: "ren4 shi5", key: "renshi" },
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
    vocabulary: [
      { id: "fuwuyuan", word: "服务员", pinyin: "fu2 wu4 yuan2", key: "fuwuyuan" },
      { id: "caidan", word: "菜单", pinyin: "cai4 dan1", key: "caidan" },
      { id: "rou", word: "肉", pinyin: "rou4", key: "rou" },
      { id: "maidan", word: "买单", pinyin: "mai3 dan1", key: "maidan" },
      { id: "haochi", word: "好吃", pinyin: "hao3 chi1", key: "haochi" },
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
    vocabulary: [
      { id: "chuzuche", word: "出租车", pinyin: "chu1 zu1 che1", key: "chuzuche" },
      { id: "qu", word: "去", pinyin: "qu4", key: "qu" },
      { id: "duoshaoqian", word: "多少钱", pinyin: "duo1 shao3 qian2", key: "duoshaoqian" },
      { id: "shifu", word: "师傅", pinyin: "shi1 fu5", key: "shifu" },
      { id: "dao", word: "到", pinyin: "dao4", key: "dao" },
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
    vocabulary: [
      { id: "fangjian", word: "房间", pinyin: "fang2 jian1", key: "fangjian" },
      { id: "dingfang", word: "订房", pinyin: "ding4 fang2", key: "dingfang" },
      { id: "zaocan", word: "早餐", pinyin: "zao3 can1", key: "zaocan" },
      { id: "tuifang", word: "退房", pinyin: "tui4 fang2", key: "tuifang" },
      { id: "huzhao", word: "护照", pinyin: "hu4 zhao4", key: "huzhao" },
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
    vocabulary: [
      { id: "chenshan", word: "衬衫", pinyin: "chen4 shan1", key: "chenshan" },
      { id: "duoshaoqian", word: "多少钱", pinyin: "duo1 shao3 qian2", key: "duoshaoqian" },
      { id: "haoma", word: "号码", pinyin: "hao4 ma3", key: "haoma" },
      { id: "huan", word: "换", pinyin: "huan4", key: "huan" },
      { id: "xianjin", word: "现金", pinyin: "xian4 jin1", key: "xianjin" },
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
    vocabulary: template.vocabulary.map((word) => ({
      id: word.id,
      word: word.word,
      pinyin: word.pinyin,
      definition: t(`${template.translationKey}.vocabulary.${word.key}`),
    })),
    hskLevel: template.hskLevel,
  };
}

/** All challenges, rendered in the caller's language via `useTranslation("challenge")`. */
export function getChallenges(t: TFunction<"challenge">): Challenge[] {
  return CHALLENGE_TEMPLATES.map((template) => renderChallenge(template, t));
}
