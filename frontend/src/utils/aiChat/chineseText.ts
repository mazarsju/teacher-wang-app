// 一-鿿: CJK Unified Ideographs. 　-〿: CJK punctuation.
// ＀-￯: fullwidth forms (，。！？ etc).
const NON_CHINESE_CONTENT_REGEX = /[^一-鿿　-〿＀-￯\s]/;

/** True when `text` has at least one character and every non-whitespace character is a Chinese ideograph or CJK/fullwidth punctuation. */
export function isChineseOnlyText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !NON_CHINESE_CONTENT_REGEX.test(trimmed);
}
