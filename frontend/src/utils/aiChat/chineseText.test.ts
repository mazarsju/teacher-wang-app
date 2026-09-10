import { describe, expect, it } from "vitest";
import { isChineseOnlyText } from "./chineseText";

describe("isChineseOnlyText", () => {
  it("accepts plain Chinese text", () => {
    expect(isChineseOnlyText("你好，世界！")).toBe(true);
  });

  it("accepts Chinese text with surrounding whitespace", () => {
    expect(isChineseOnlyText("  你好  ")).toBe(true);
  });

  it("rejects text with Latin letters", () => {
    expect(isChineseOnlyText("你好 world")).toBe(false);
  });

  it("rejects pinyin", () => {
    expect(isChineseOnlyText("nǐ hǎo")).toBe(false);
  });

  it("rejects empty or whitespace-only text", () => {
    expect(isChineseOnlyText("   ")).toBe(false);
  });
});
