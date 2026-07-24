export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "stage"; text: string };

const STAGE_DIRECTION_PATTERN = /\[\[([\s\S]*?)\]\]/g;

/**
 * Split assistant content into plain text and ``[[...]]`` stage directions
 * found anywhere in the message (not only when the whole string is brackets).
 */
export function parseMessageSegments(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(STAGE_DIRECTION_PATTERN)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      const text = content.slice(lastIndex, matchIndex).trim();
      if (text !== "") {
        segments.push({ type: "text", text });
      }
    }

    const inner = match[1].trim();
    if (inner !== "") {
      segments.push({ type: "stage", text: inner });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text !== "") {
      segments.push({ type: "text", text });
    }
  }

  return segments;
}

/**
 * Return every ``[[...]]`` inner text found anywhere in ``content``.
 * Returns null when none are present.
 */
export function getStageDirectionLines(content: string): string[] | null {
  const lines = parseMessageSegments(content)
    .filter((segment): segment is { type: "stage"; text: string } => {
      return segment.type === "stage";
    })
    .map((segment) => segment.text);

  return lines.length > 0 ? lines : null;
}
