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
// are stable data (used as React keys, completion-progress ids, and avatar
// lookups) — only translationKey/key resolve into locales/en/challenge.json
// via `getChallenges()`. Keep this array's order in sync with
// challenge.json; display order is sorted by hskLevel in `getChallenges()`
// regardless of declaration order here.
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
      { id: "dao", word: "到", pinyin: "dao4", key: "dao" },
    ],
    hskLevel: 1,
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
    hskLevel: 3,
  },
  {
    id: "challenge-directions",
    translationKey: "directions",
    character: {
      id: "challenge-directions",
      chineseName: "路人",
      avatarVariant: "passerby",
    },
    tasks: [
      { id: "greet-passerby", key: "greetPasserby" },
      { id: "ask-location", key: "askLocation" },
      { id: "ask-directions", key: "askDirections" },
      { id: "thank-passerby", key: "thankPasserby" },
    ],
    vocabulary: [
      { id: "qingwen", word: "请问", pinyin: "qing3 wen4", key: "qingwen" },
      { id: "nali", word: "哪里", pinyin: "na3 li3", key: "nali" },
      { id: "zenmezou", word: "怎么走", pinyin: "zen3 me5 zou3", key: "zenmezou" },
      { id: "yuan", word: "远", pinyin: "yuan3", key: "yuan" },
      { id: "xiexie", word: "谢谢", pinyin: "xie4 xie5", key: "xiexie" },
    ],
    hskLevel: 1,
  },
  {
    id: "challenge-train-station",
    translationKey: "trainStation",
    character: {
      id: "challenge-train-station",
      chineseName: "售票员",
      avatarVariant: "ticket-seller",
    },
    tasks: [
      { id: "greet-ticket-seller", key: "greetTicketSeller" },
      { id: "buy-ticket", key: "buyTicket" },
      { id: "ask-departure-time", key: "askDepartureTime" },
      { id: "pay-ticket", key: "payTicket" },
    ],
    vocabulary: [
      { id: "chepiao", word: "车票", pinyin: "che1 piao4", key: "chepiao" },
      { id: "huochezhan", word: "火车站", pinyin: "huo3 che1 zhan4", key: "huochezhan" },
      { id: "chufa", word: "出发", pinyin: "chu1 fa1", key: "chufa" },
      { id: "zuowei", word: "座位", pinyin: "zuo4 wei4", key: "zuowei" },
      { id: "daoda", word: "到达", pinyin: "dao4 da2", key: "daoda" },
    ],
    hskLevel: 3,
  },
  {
    id: "challenge-doctor",
    translationKey: "doctor",
    character: {
      id: "challenge-doctor",
      chineseName: "医生",
      avatarVariant: "doctor",
    },
    tasks: [
      { id: "greet-doctor", key: "greetDoctor" },
      { id: "describe-symptoms", key: "describeSymptoms" },
      { id: "ask-for-medicine", key: "askForMedicine" },
      { id: "ask-rest-days", key: "askRestDays" },
    ],
    vocabulary: [
      { id: "ganmao", word: "感冒", pinyin: "gan3 mao4", key: "ganmao" },
      { id: "fashao", word: "发烧", pinyin: "fa1 shao1", key: "fashao" },
      { id: "kesou", word: "咳嗽", pinyin: "ke2 sou5", key: "kesou" },
      { id: "guahao", word: "挂号", pinyin: "gua4 hao4", key: "guahao" },
      { id: "xiuxi", word: "休息", pinyin: "xiu1 xi5", key: "xiuxi" },
    ],
    hskLevel: 4,
  },
  {
    id: "challenge-job-interview",
    translationKey: "jobInterview",
    character: {
      id: "challenge-job-interview",
      chineseName: "面试官",
      avatarVariant: "interviewer",
    },
    tasks: [
      { id: "greet-interviewer", key: "greetInterviewer" },
      { id: "introduce-experience", key: "introduceExperience" },
      { id: "ask-salary", key: "askSalary" },
      { id: "ask-result", key: "askResult" },
    ],
    vocabulary: [
      { id: "mianshi", word: "面试", pinyin: "mian4 shi4", key: "mianshi" },
      { id: "jingyan", word: "经验", pinyin: "jing1 yan4", key: "jingyan" },
      { id: "gongzi", word: "工资", pinyin: "gong1 zi1", key: "gongzi" },
      { id: "zhiwei", word: "职位", pinyin: "zhi2 wei4", key: "zhiwei" },
      { id: "hetong", word: "合同", pinyin: "he2 tong5", key: "hetong" },
    ],
    hskLevel: 4,
  },
  {
    id: "challenge-library",
    translationKey: "library",
    character: {
      id: "challenge-library",
      chineseName: "图书管理员",
      avatarVariant: "librarian",
    },
    tasks: [
      { id: "greet-librarian", key: "greetLibrarian" },
      { id: "borrow-book", key: "borrowBook" },
      { id: "ask-return-date", key: "askReturnDate" },
      { id: "thank-librarian", key: "thankLibrarian" },
    ],
    vocabulary: [
      { id: "shu", word: "书", pinyin: "shu1", key: "shu" },
      { id: "jie", word: "借", pinyin: "jie4", key: "jie" },
      { id: "huan", word: "还", pinyin: "huan2", key: "huan" },
      { id: "ka", word: "卡", pinyin: "ka3", key: "ka" },
      { id: "xiexie", word: "谢谢", pinyin: "xie4 xie5", key: "xiexie" },
    ],
    hskLevel: 1,
  },
  {
    id: "challenge-bus",
    translationKey: "bus",
    character: {
      id: "challenge-bus",
      chineseName: "公交车司机",
      avatarVariant: "bus-driver",
    },
    tasks: [
      { id: "ask-bus-route", key: "askBusRoute" },
      { id: "ask-stops", key: "askStops" },
      { id: "ask-get-off-stop", key: "askGetOffStop" },
      { id: "thank-driver", key: "thankDriver" },
    ],
    vocabulary: [
      { id: "gongjiaoche", word: "公交车", pinyin: "gong1 jiao1 che1", key: "gongjiaoche" },
      { id: "chezhan", word: "车站", pinyin: "che1 zhan4", key: "chezhan" },
      { id: "shangche", word: "上车", pinyin: "shang4 che1", key: "shangche" },
      { id: "xiache", word: "下车", pinyin: "xia4 che1", key: "xiache" },
      { id: "zhan", word: "站", pinyin: "zhan4", key: "zhan" },
    ],
    hskLevel: 2,
  },
  {
    id: "challenge-hair-salon",
    translationKey: "hairSalon",
    character: {
      id: "challenge-hair-salon",
      chineseName: "理发师",
      avatarVariant: "hairdresser",
    },
    tasks: [
      { id: "greet-hairdresser", key: "greetHairdresser" },
      { id: "ask-for-haircut", key: "askForHaircut" },
      { id: "describe-length", key: "describeLength" },
      { id: "pay-haircut", key: "payHaircut" },
    ],
    vocabulary: [
      { id: "lifa", word: "理发", pinyin: "li3 fa4", key: "lifa" },
      { id: "toufa", word: "头发", pinyin: "tou2 fa5", key: "toufa" },
      { id: "xi", word: "洗", pinyin: "xi3", key: "xi" },
      { id: "duan", word: "短", pinyin: "duan3", key: "duan" },
      { id: "chang", word: "长", pinyin: "chang2", key: "chang" },
    ],
    hskLevel: 3,
  },
  {
    id: "challenge-apartment",
    translationKey: "apartment",
    character: {
      id: "challenge-apartment",
      chineseName: "房东",
      avatarVariant: "landlord",
    },
    tasks: [
      { id: "greet-landlord", key: "greetLandlord" },
      { id: "ask-rent", key: "askRent" },
      { id: "ask-area", key: "askArea" },
      { id: "confirm-rental", key: "confirmRental" },
    ],
    vocabulary: [
      { id: "fangzu", word: "房租", pinyin: "fang2 zu1", key: "fangzu" },
      { id: "fangdong", word: "房东", pinyin: "fang2 dong1", key: "fangdong" },
      { id: "hetong", word: "合同", pinyin: "he2 tong5", key: "hetong" },
      { id: "zhongjie", word: "中介", pinyin: "zhong1 jie4", key: "zhongjie" },
      { id: "mianji", word: "面积", pinyin: "mian4 ji1", key: "mianji" },
    ],
    hskLevel: 4,
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

/**
 * All challenges, rendered in the caller's language via `useTranslation("challenge")`,
 * ordered by HSK level ascending (stable, so same-level challenges keep the
 * order they're declared in above).
 */
export function getChallenges(t: TFunction<"challenge">): Challenge[] {
  return CHALLENGE_TEMPLATES.map((template) => renderChallenge(template, t)).sort(
    (a, b) => a.hskLevel - b.hskLevel,
  );
}
