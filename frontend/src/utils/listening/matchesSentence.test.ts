import { matchesSentence, normalizeForComparison } from "./matchesSentence";

describe("normalizeForComparison", () => {
  it("strips whitespace and punctuation", () => {
    expect(normalizeForComparison("你 好，世界！")).toBe("你好世界");
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
});
