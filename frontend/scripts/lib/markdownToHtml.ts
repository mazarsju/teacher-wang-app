/**
 * Standalone port of src/utils/formatMarkdownText.tsx's markdown-ish subset
 * (headers, **bold**, *italic*, `code`, GFM tables, GitHub-style alerts,
 * 【lenticular】 highlighting) to plain HTML strings, for the static public
 * grammar pages generated outside the Vite/React runtime.
 */

const MARKDOWN_HEADER_PATTERN = /^(#{1,6})\s+(.*)$/;
const ALERT_START_PATTERN = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nextMarkupIndex(text: string, from: number, highlightLenticular: boolean) {
  const found = [
    text.indexOf("**", from),
    text.indexOf("`", from),
    text.indexOf("*", from),
    highlightLenticular ? text.indexOf("【", from) : -1,
  ].filter((index) => index >= 0);
  return found.length ? Math.min(...found) : -1;
}

function renderInline(text: string, highlightLenticular = true): string {
  let html = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close !== -1) {
        html += `<strong>${renderInline(text.slice(i + 2, close), highlightLenticular)}</strong>`;
        i = close + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close !== -1) {
        html += `<code>${escapeHtml(text.slice(i + 1, close))}</code>`;
        i = close + 1;
        continue;
      }
    }
    if (text[i] === "*" && !text.startsWith("**", i)) {
      const close = text.indexOf("*", i + 1);
      if (close !== -1) {
        html += `<em>${renderInline(text.slice(i + 1, close), highlightLenticular)}</em>`;
        i = close + 1;
        continue;
      }
    }
    if (highlightLenticular && text[i] === "【") {
      const close = text.indexOf("】", i + 1);
      if (close !== -1) {
        html += `<span class="lenticular">${renderInline(text.slice(i + 1, close), false)}</span>`;
        i = close + 1;
        continue;
      }
    }
    const next = nextMarkupIndex(text, i, highlightLenticular);
    if (next === -1) {
      html += escapeHtml(text.slice(i));
      break;
    }
    if (next === i) {
      html += escapeHtml(text[i]);
      i += 1;
      continue;
    }
    html += escapeHtml(text.slice(i, next));
    i = next;
  }
  return html;
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.includes("|", 1);
}

function splitTableCells(line: string) {
  const trimmed = line.trim();
  const inner =
    trimmed.startsWith("|") && trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed;
  return inner.split("|").map((cell) => cell.trim());
}

export function renderExplanationHtml(text: string): string {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let i = 0;
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(`<p class="explanation-para">${renderInline(paragraph.join("\n"))}</p>`);
      paragraph = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    const headerMatch = line.match(MARKDOWN_HEADER_PATTERN);
    if (headerMatch) {
      flushParagraph();
      const level = Math.min(headerMatch[1].length, 6);
      blocks.push(`<h${level}>${renderInline(headerMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    const alertMatch = line.match(ALERT_START_PATTERN);
    if (alertMatch) {
      flushParagraph();
      const kind = alertMatch[1].toLowerCase();
      const bodyLines: string[] = [];
      if (alertMatch[2]) bodyLines.push(alertMatch[2]);
      let next = i + 1;
      while (next < lines.length && lines[next].trimStart().startsWith(">")) {
        bodyLines.push(lines[next].replace(/^\s*>\s?/, ""));
        next += 1;
      }
      blocks.push(
        `<aside class="callout callout--${kind}"><strong class="calloutLabel">${kind.toUpperCase()}</strong>${renderInline(bodyLines.join("\n"), kind !== "tip")}</aside>`,
      );
      i = next;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEPARATOR_PATTERN.test(lines[i + 1].trim())) {
      flushParagraph();
      const headers = splitTableCells(line);
      const rows: string[][] = [];
      let next = i + 2;
      while (next < lines.length && isTableRow(lines[next])) {
        rows.push(splitTableCells(lines[next]));
        next += 1;
      }
      const headHtml = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
      const bodyHtml = rows
        .map((row) => `<tr>${headers.map((_, idx) => `<td>${renderInline(row[idx] ?? "")}</td>`).join("")}</tr>`)
        .join("");
      blocks.push(`<div class="tableWrap"><table class="table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
      i = next;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks.join("\n");
}

/** Strips markup down to plain text, for meta descriptions / excerpts. */
export function stripMarkdownToText(text: string, maxLength = 155): string {
  const plain = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/[【】]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}
