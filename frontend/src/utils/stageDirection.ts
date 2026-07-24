/**
 * If ``content`` is a single stage-direction wrapped in square brackets,
 * return the inner text (brackets removed). Otherwise return null.
 */
export function getStageDirectionText(content: string): string | null {
  const trimmed = content.trim();
  const match = /^\[([\s\S]*)\]$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const inner = match[1].trim();
  return inner === "" ? null : inner;
}
