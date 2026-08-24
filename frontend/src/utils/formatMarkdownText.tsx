import type { ReactNode } from "react";
import styles from "./formatMarkdownText.module.css";

const MARKDOWN_INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|【[^】]+】)/g;
const MARKDOWN_HEADER_PATTERN = /^(#{1,6})\s+(.*)$/;
const ALERT_START_PATTERN =
  /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;
const TABLE_SEPARATOR_PATTERN =
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function renderInlineFormattedText(
  text: string,
  keyPrefix: string,
  highlightLenticular = true,
) {
  return text.split(MARKDOWN_INLINE_PATTERN).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key}>
          {renderInlineFormattedText(
            part.slice(2, -2),
            key,
            highlightLenticular,
          )}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={key}>
          {renderInlineFormattedText(part.slice(1, -1), key, highlightLenticular)}
        </em>
      );
    }
    if (highlightLenticular && part.startsWith("【") && part.endsWith("】")) {
      return (
        <span key={key} className={styles.lenticular}>
          {part.slice(1, -1)}
        </span>
      );
    }
    return part;
  });
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.includes("|", 1);
}

function splitTableCells(line: string) {
  const trimmed = line.trim();
  const inner =
    trimmed.startsWith("|") && trimmed.endsWith("|")
      ? trimmed.slice(1, -1)
      : trimmed;
  return inner.split("|").map((cell) => cell.trim());
}

function renderLine(
  line: string,
  lineIndex: number,
  lastIndex: number,
  headingClassName?: string,
) {
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
      {lineIndex < lastIndex ? "\n" : null}
    </span>
  );
}

/**
 * Lightweight Markdown-ish renderer shared by the chat agent messages and
 * the grammar explanation view: headers (#-######), **bold**, *italic*,
 * `code`, GFM tables, and GitHub-style alerts (`> [!TIP]`).
 */
export function renderFormattedText(text: string, headingClassName?: string) {
  const lines = text.split("\n");
  if (
    lines.length === 1 &&
    !MARKDOWN_HEADER_PATTERN.test(text) &&
    !ALERT_START_PATTERN.test(text) &&
    !isTableRow(text)
  ) {
    return renderInlineFormattedText(text, "0");
  }

  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const alertMatch = lines[i].match(ALERT_START_PATTERN);
    if (alertMatch) {
      const kind = alertMatch[1].toLowerCase();
      const bodyLines: string[] = [];
      if (alertMatch[2]) {
        bodyLines.push(alertMatch[2]);
      }
      let next = i + 1;
      while (next < lines.length && lines[next].trimStart().startsWith(">")) {
        bodyLines.push(lines[next].replace(/^\s*>\s?/, ""));
        next += 1;
      }
      nodes.push(
        <aside
          key={`alert-${i}`}
          className={`${styles.callout} ${styles[`callout--${kind}`] ?? ""}`}
        >
          <strong className={styles.calloutLabel}>{kind.toUpperCase()}</strong>
          {renderInlineFormattedText(
            bodyLines.join("\n"),
            `alert-${i}`,
            kind !== "tip",
          )}
        </aside>,
      );
      i = next;
      continue;
    }

    if (
      isTableRow(lines[i]) &&
      i + 1 < lines.length &&
      TABLE_SEPARATOR_PATTERN.test(lines[i + 1].trim())
    ) {
      const headers = splitTableCells(lines[i]);
      const rows: string[][] = [];
      let next = i + 2;
      while (next < lines.length && isTableRow(lines[next])) {
        if (TABLE_SEPARATOR_PATTERN.test(lines[next].trim())) {
          next += 1;
          continue;
        }
        rows.push(splitTableCells(lines[next]));
        next += 1;
      }
      nodes.push(
        <div key={`table-${i}`} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((cell, cellIndex) => (
                  <th key={cellIndex}>
                    {renderInlineFormattedText(cell, `th-${i}-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex}>
                      {renderInlineFormattedText(
                        row[cellIndex] ?? "",
                        `td-${i}-${rowIndex}-${cellIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = next;
      continue;
    }

    nodes.push(renderLine(lines[i], i, lines.length - 1, headingClassName));
    i += 1;
  }
  return nodes;
}
