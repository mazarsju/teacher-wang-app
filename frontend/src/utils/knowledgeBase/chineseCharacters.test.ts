import {
  isHanCharacter,
  isValidCharacter,
  isValidChineseWord,
} from "./chineseCharacters";

describe("isHanCharacter", () => {
  it.each(["爱", "好"])("accepts Chinese character %s", (value) => {
    expect(isHanCharacter(value)).toBe(true);
  });

  it.each(["a", "1", ""])("rejects non-Chinese value %s", (value) => {
    expect(isHanCharacter(value)).toBe(false);
  });
});

describe("isValidCharacter", () => {
  it.each(["爱", " 好 "])("accepts a single Chinese character in %s", (value) => {
    expect(isValidCharacter(value)).toBe(true);
  });

  it.each(["", "   ", "爱好", "a"])("rejects invalid character value %s", (value) => {
    expect(isValidCharacter(value)).toBe(false);
  });
});

describe("isValidChineseWord", () => {
  it.each(["爱好", " 中国 "])("accepts Chinese words in %s", (value) => {
    expect(isValidChineseWord(value)).toBe(true);
  });

  it.each(["", "   ", "hello", "爱a", "爱1"])(
    "rejects invalid word value %s",
    (value) => {
      expect(isValidChineseWord(value)).toBe(false);
    },
  );
});
