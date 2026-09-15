import {
  diffSentenceChars,
  matchesSentence,
  normalizeForComparison,
} from "./matchesSentence";

describe("normalizeForComparison", () => {
  it("strips whitespace and punctuation", () => {
    expect(normalizeForComparison("你 好，世界！")).toBe("你好世界");
  });

  it("strips any non-Chinese, non-digit character, including ones outside the old punctuation list", () => {
    expect(normalizeForComparison("你好…（世界）abc")).toBe("你好世界");
  });

  it("normalizes digits to their Chinese numeral characters", () => {
    expect(normalizeForComparison("我今年20岁")).toBe("我今年二零岁");
    expect(normalizeForComparison("我今年二零岁")).toBe("我今年二零岁");
  });
});

describe("matchesSentence", () => {
  it("matches an exact transcript", () => {
    expect(matchesSentence("你家有几个人？", "你家有几个人？")).toBe(true);
  });

  it("matches ignoring punctuation and whitespace differences", () => {
    expect(matchesSentence("你家 有几个人", "你家有几个人？")).toBe(true);
  });

  it("does not match a different sentence", () => {
    expect(matchesSentence("你好", "再见")).toBe(false);
  });

  it("does not match an empty input", () => {
    expect(matchesSentence("", "你好")).toBe(false);
  });

  it("matches ignoring punctuation marks not in the old hardcoded list", () => {
    expect(matchesSentence("你家有几个人…", "（你家有几个人）")).toBe(true);
  });

  it("matches a digit against its Chinese numeral character", () => {
    expect(matchesSentence("三", "3")).toBe(true);
  });

  it("matches a Chinese numeral character against a digit", () => {
    expect(matchesSentence("3", "三")).toBe(true);
  });

  it("matches when both sides use the digit form", () => {
    expect(matchesSentence("3", "3")).toBe(true);
  });

  it("matches when both sides use the Chinese numeral form", () => {
    expect(matchesSentence("三", "三")).toBe(true);
  });

  it("matches a digit within a full sentence against its Chinese numeral form", () => {
    expect(matchesSentence("我家有5口人", "我家有五口人")).toBe(true);
    expect(matchesSentence("我家有五口人", "我家有5口人")).toBe(true);
  });
});

describe("diffSentenceChars", () => {
  it("marks every character matched for an exact transcript", () => {
    expect(diffSentenceChars("你家有几个人？", "你家有几个人？")).toEqual([
      { char: "你", matched: true },
      { char: "家", matched: true },
      { char: "有", matched: true },
      { char: "几", matched: true },
      { char: "个", matched: true },
      { char: "人", matched: true },
      { char: "？", matched: null },
    ]);
  });

  it("marks the wrong characters as mismatched and leaves punctuation neutral", () => {
    expect(diffSentenceChars("你家有几本人", "你家有几个人？")).toEqual([
      { char: "你", matched: true },
      { char: "家", matched: true },
      { char: "有", matched: true },
      { char: "几", matched: true },
      { char: "个", matched: false },
      { char: "人", matched: true },
      { char: "？", matched: null },
    ]);
  });

  it("marks trailing characters as mismatched when the input is shorter", () => {
    expect(diffSentenceChars("你家", "你家有几个人？")).toEqual([
      { char: "你", matched: true },
      { char: "家", matched: true },
      { char: "有", matched: false },
      { char: "几", matched: false },
      { char: "个", matched: false },
      { char: "人", matched: false },
      { char: "？", matched: null },
    ]);
  });

  it("keeps a dropped leading character from shifting the rest out of alignment", () => {
    expect(diffSentenceChars("有一只猫", "我有一只猫")).toEqual([
      { char: "我", matched: false },
      { char: "有", matched: true },
      { char: "一", matched: true },
      { char: "只", matched: true },
      { char: "猫", matched: true },
    ]);
  });

  it("marks a digit in the expected text matched when the input uses the Chinese numeral form", () => {
    expect(diffSentenceChars("我家有五口人", "我家有5口人")).toEqual([
      { char: "我", matched: true },
      { char: "家", matched: true },
      { char: "有", matched: true },
      { char: "5", matched: true },
      { char: "口", matched: true },
      { char: "人", matched: true },
    ]);
  });

  it("marks a Chinese numeral in the expected text matched when the input uses the digit form", () => {
    expect(diffSentenceChars("我家有5口人", "我家有五口人")).toEqual([
      { char: "我", matched: true },
      { char: "家", matched: true },
      { char: "有", matched: true },
      { char: "五", matched: true },
      { char: "口", matched: true },
      { char: "人", matched: true },
    ]);
  });
});
