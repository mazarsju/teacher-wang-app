export const START = [
  "",
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "z",
  "c",
  "s",
  "zh",
  "ch",
  "sh",
  "r",
  "j",
  "q",
  "x",
  "g",
  "k",
  "h",
  "w",
  "y",
];

export const FINAL = [
  "a",
  "ai",
  "ao",
  "an",
  "ang",
  "e",
  "ei",
  "en",
  "eng",
  "er",
  "o",
  "ou",
  "ong",
  "i",
  "i*",
  "ia",
  "iao",
  "ie",
  "iu",
  "ian",
  "iang",
  "in",
  "ing",
  "iong",
  "u",
  "ua",
  "uai",
  "ui",
  "uo",
  "uan",
  "uang",
  "un",
  "ueng",
  "ü",
  "üe",
  "üan",
  "ün",
];

// Some of the pinyin combinations are invalid.
export const INVALID_PINYIN = [
"ong",
"i*",
"be",
"ber",
"bou",
"bong",
"bi*",
"bia",
"biu",
"biang",
"biong",
"bua",
"buai",
"bui",
"buo",
"buan",
"buang",
"bun",
"bueng",
"bü",
"büe",
"büan",
"bün",
"pe",
"per",
"pong",
"pi*",
"pia",
"piu",
"piang",
"piong",
"pua",
"puai",
"pui",
"puo",
"puan",
"puang",
"pun",
"pueng",
"pü",
"püe",
"püan",
"pün",
"mer",
"mong",
"mi*",
"mia",
"miang",
"miong",
"mua",
"muai",
"mui",
"muo",
"muan",
"muang",
"mun",
"mueng",
"mü",
"müe",
"müan",
"mün",
"fai",
"fao",
"fe",
"fer",
"fo",
"fong",
"fi",
"fi*",
"fia",
"fiao",
"fie",
"fiu",
"fian",
"fiang",
"fin",
"fing",
"fiong",
"fua",
"fuai",
"fui",
"fuo",
"fuan",
"fuang",
"fun",
"fueng",
"fü",
"füe",
"füan",
"fün",
"der",
"do",
"di*",
"dia",
"diang",
"din",
"diong",
"dua",
"duai",
"duang",
"dueng",
"dü",
"düe",
"düan",
"dün",
"tei",
"ten",
"ter",
"to",
"ti*",
"tia",
"tiu",
"tiang",
"tin",
"tiong",
"tua",
"tuai",
"tuang",
"tueng",
"tü",
"tüe",
"tüan",
"tün",
"ner",
"no",
"ni*",
"nia",
"niong",
"nua",
"nuai",
"nui",
"nuang",
"nun",
"nueng",
"nüan",
"nün",
"len",
"ler",
"li*",
"liong",
"lua",
"luai",
"lui",
"luang",
"lueng",
"lüan",
"lün",
"zer",
"zo",
"zi",
"zia",
"ziao",
"zie",
"ziu",
"zian",
"ziang",
"zin",
"zing",
"ziong",
"zua",
"zuai",
"zuang",
"zueng",
"zü",
"züe",
"züan",
"zün",
"cer",
"co",
"ci",
"cia",
"ciao",
"cie",
"ciu",
"cian",
"ciang",
"cin",
"cing",
"ciong",
"cua",
"cuai",
"cuang",
"cueng",
"cü",
"cüe",
"cüan",
"cün",
"sei",
"ser",
"so",
"si",
"sia",
"siao",
"sie",
"siu",
"sian",
"siang",
"sin",
"sing",
"siong",
"sua",
"suai",
"suang",
"sueng",
"sü",
"süe",
"süan",
"sün",
"zher",
"zho",
"zhi",
"zhia",
"zhiao",
"zhie",
"zhiu",
"zhian",
"zhiang",
"zhin",
"zhing",
"zhiong",
"zhueng",
"zhü",
"zhüe",
"zhüan",
"zhün",
"chei",
"cher",
"cho",
"chi",
"chia",
"chiao",
"chie",
"chiu",
"chian",
"chiang",
"chin",
"ching",
"chiong",
"chueng",
"chü",
"chüe",
"chüan",
"chün",
"sher",
"sho",
"shong",
"shi",
"shia",
"shiao",
"shie",
"shiu",
"shian",
"shiang",
"shin",
"shing",
"shiong",
"shueng",
"shü",
"shüe",
"shüan",
"shün",
"ra",
"rai",
"rei",
"rer",
"ro",
"ri",
"ria",
"riao",
"rie",
"riu",
"rian",
"riang",
"rin",
"ring",
"riong",
"ruai",
"ruang",
"rueng",
"rü",
"rüe",
"rüan",
"rün",
"ja",
"jai",
"jao",
"jan",
"jang",
"je",
"jei",
"jen",
"jeng",
"jer",
"jo",
"jou",
"jong",
"ji*",
"jua",
"juai",
"jui",
"juo",
"juang",
"jueng",
"jü",
"jüe",
"jüan",
"jün",
"qa",
"qai",
"qao",
"qan",
"qang",
"qe",
"qei",
"qen",
"qeng",
"qer",
"qo",
"qou",
"qong",
"qi*",
"qua",
"quai",
"qui",
"quo",
"quang",
"queng",
"qü",
"qüe",
"qüan",
"qün",
"xa",
"xai",
"xao",
"xan",
"xang",
"xe",
"xei",
"xen",
"xeng",
"xer",
"xo",
"xou",
"xong",
"xi*",
"xua",
"xuai",
"xui",
"xuo",
"xuang",
"xueng",
"xü",
"xüe",
"xüan",
"xün",
"ger",
"go",
"gi",
"gi*",
"gia",
"giao",
"gie",
"giu",
"gian",
"giang",
"gin",
"ging",
"giong",
"gueng",
"gü",
"güe",
"güan",
"gün",
"ker",
"ko",
"ki",
"ki*",
"kia",
"kiao",
"kie",
"kiu",
"kian",
"kiang",
"kin",
"king",
"kiong",
"kueng",
"kü",
"küe",
"küan",
"kün",
"her",
"ho",
"hi",
"hi*",
"hia",
"hiao",
"hie",
"hiu",
"hian",
"hiang",
"hin",
"hing",
"hiong",
"hueng",
"hü",
"hüe",
"hüan",
"hün",
"wao",
"we",
"wer",
"wou",
"wong",
"wi",
"wi*",
"wia",
"wiao",
"wie",
"wiu",
"wian",
"wiang",
"win",
"wing",
"wiong",
"wua",
"wuai",
"wui",
"wuo",
"wuan",
"wuang",
"wun",
"wueng",
"wü",
"wüe",
"wüan",
"wün",
"yai",
"yei",
"yen",
"yeng",
"yer",
"yo",
"yi*",
"yia",
"yiao",
"yie",
"yiu",
"yian",
"yiang",
"yiong",
"yu",
"yua",
"yuai",
"yui",
"yuo",
"yuan",
"yuang",
"yun",
"yueng",
]

const INVALID_PINYIN_SET = new Set(INVALID_PINYIN);

const VALID_TONES = new Set(["1", "2", "3", "4"]);

export type PinyinTone = 1 | 2 | 3 | 4;

const STARTS_BY_LENGTH = [...START].sort((a, b) => b.length - a.length);
const FINAL_SET = new Set(FINAL);

export type PinyinSyllable = {
  start: string;
  final: string;
};

function stripTone(value: string): string {
  const tone = value[value.length - 1];
  return tone !== undefined && VALID_TONES.has(tone)
    ? value.slice(0, -1)
    : value;
}

export function parseTone(value: string): PinyinTone | null {
  const trimmed = value.trim().toLowerCase();
  const tone = trimmed[trimmed.length - 1];
  if (tone !== undefined && VALID_TONES.has(tone)) {
    return Number(tone) as PinyinTone;
  }
  return null;
}

export function isInvalidPinyinSyllable(start: string, final: string): boolean {
  return INVALID_PINYIN_SET.has(start + final);
}

export function parsePinyinSyllable(value: string): PinyinSyllable | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") {
    return null;
  }

  const pinyin = stripTone(trimmed);
  if (pinyin === "") {
    return null;
  }

  for (const start of STARTS_BY_LENGTH) {
    if (!pinyin.startsWith(start)) {
      continue;
    }

    const remainder = pinyin.slice(start.length);
    if (FINAL_SET.has(remainder)) {
      return { start, final: remainder };
    }
  }

  return null;
}

export function isValidPinyin(value: string): boolean {
  return parsePinyinSyllable(value) !== null;
}

/**
 * When `value` is not valid pinyin, but replacing ascii "u"/"U" with "ü"/"Ü"
 * yields valid pinyin, return that suggestion. Otherwise return null.
 */
export function suggestUmlautPinyin(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || isValidPinyin(trimmed)) {
    return null;
  }

  const withUmlaut = trimmed.replace(/u/g, "ü").replace(/U/g, "Ü");
  if (withUmlaut !== trimmed && isValidPinyin(withUmlaut)) {
    return withUmlaut;
  }

  return null;
}

/** Accented vowels found in Anki pinyin fields → plain vowel + tone digit. */
const PINYIN_ACCENT_MAP: Array<{
  problematic_char: string;
  corresponding_char: string;
  corresponding_tone: string;
}> = [
  { problematic_char: "ī", corresponding_char: "i", corresponding_tone: "1" },
  { problematic_char: "í", corresponding_char: "i", corresponding_tone: "2" },
  { problematic_char: "ǐ", corresponding_char: "i", corresponding_tone: "3" },
  { problematic_char: "ì", corresponding_char: "i", corresponding_tone: "4" },
  { problematic_char: "ā", corresponding_char: "a", corresponding_tone: "1" },
  { problematic_char: "á", corresponding_char: "a", corresponding_tone: "2" },
  { problematic_char: "ǎ", corresponding_char: "a", corresponding_tone: "3" },
  { problematic_char: "à", corresponding_char: "a", corresponding_tone: "4" },
  { problematic_char: "ē", corresponding_char: "e", corresponding_tone: "1" },
  { problematic_char: "é", corresponding_char: "e", corresponding_tone: "2" },
  { problematic_char: "ě", corresponding_char: "e", corresponding_tone: "3" },
  { problematic_char: "è", corresponding_char: "e", corresponding_tone: "4" },
  { problematic_char: "ō", corresponding_char: "o", corresponding_tone: "1" },
  { problematic_char: "ó", corresponding_char: "o", corresponding_tone: "2" },
  { problematic_char: "ǒ", corresponding_char: "o", corresponding_tone: "3" },
  { problematic_char: "ò", corresponding_char: "o", corresponding_tone: "4" },
  { problematic_char: "ū", corresponding_char: "u", corresponding_tone: "1" },
  { problematic_char: "ú", corresponding_char: "u", corresponding_tone: "2" },
  { problematic_char: "ǔ", corresponding_char: "u", corresponding_tone: "3" },
  { problematic_char: "ù", corresponding_char: "u", corresponding_tone: "4" },
];

const ACCENT_BY_CHAR = new Map(
  PINYIN_ACCENT_MAP.map((rule) => [rule.problematic_char, rule]),
);
const ANKI_VALID_TONES = new Set(["1", "2", "3", "4"]);

export function replacePinyinAccents(token: string): string {
  let tone: string | undefined;
  const chars: string[] = [];
  for (const char of token) {
    let rule = ACCENT_BY_CHAR.get(char);
    if (rule === undefined) {
      const lower = char.toLowerCase();
      rule = ACCENT_BY_CHAR.get(lower);
      if (rule !== undefined && char !== lower) {
        chars.push(rule.corresponding_char.toUpperCase());
        tone = rule.corresponding_tone;
        continue;
      }
    }
    if (rule === undefined) {
      chars.push(char);
      continue;
    }
    chars.push(rule.corresponding_char);
    tone = rule.corresponding_tone;
  }

  const result = chars.join("");
  if (tone === undefined) {
    return result;
  }
  if (result !== "" && ANKI_VALID_TONES.has(result[result.length - 1] ?? "")) {
    return result.slice(0, -1) + tone;
  }
  return result + tone;
}

/** Normalize one Anki pinyin syllable to app form (e.g. Qīn → qin1). */
export function normalizeAnkiPinyinToken(token: string): string | null {
  const trimmed = token.trim();
  if (trimmed === "") {
    return null;
  }

  const candidate = replacePinyinAccents(trimmed).toLowerCase();
  if (isValidPinyin(candidate)) {
    return candidate;
  }

  const umlaut = suggestUmlautPinyin(candidate);
  if (umlaut !== null) {
    return umlaut.toLowerCase();
  }

  return null;
}
