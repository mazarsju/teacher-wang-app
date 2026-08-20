const MARKDOWN_INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
const MARKDOWN_HEADER_PATTERN = /^(#{1,6})\s+(.*)$/;

function renderInlineFormattedText(text: string, keyPrefix: string) {
  return text.split(MARKDOWN_INLINE_PATTERN).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

/**
 * Lightweight Markdown-ish renderer shared by the chat agent messages and
 * the grammar explanation view: headers (#-######), **bold**, *italic*,
 * `code`. Not a full Markdown parser — deliberately the same small subset
 * the AI agents' output already relies on.
 */
export function renderFormattedText(text: string, headingClassName?: string) {
  const lines = text.split("\n");
  if (lines.length === 1 && !MARKDOWN_HEADER_PATTERN.test(text)) {
    return renderInlineFormattedText(text, "0");
  }
  return lines.map((line, lineIndex) => {
    const headerMatch = line.match(MARKDOWN_HEADER_PATTERN);
    if (headerMatch) {
      const level = Math.min(headerMatch[1].length, 6);
      const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <HeadingTag key={lineIndex} className={headingClassName}>
          {renderInlineFormattedText(headerMatch[2], String(lineIndex))}
        </HeadingTag>
      );
    }
    return (
      <span key={lineIndex}>
        {renderInlineFormattedText(line, String(lineIndex))}
        {lineIndex < lines.length - 1 ? "\n" : null}
      </span>
    );
  });
}
