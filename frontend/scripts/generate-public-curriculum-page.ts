/**
 * Generates the static /curriculum/ overview page: every HSK level, collapsible
 * (native <details>, same as the authenticated GrammarPage.tsx), listing every
 * grammar rule + writing-practice topic. Only HSK1 grammar rules that already
 * have a generated public page (see generate-public-grammar-page.ts) are
 * clickable; everything else (other levels, writing practice) is shown locked,
 * matching the real app's `locked` row style.
 *
 * Usage: npm run generate:public-curriculum
 * (run `python3 -m backend.jobs.generate_public_curriculum` first)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(SCRIPT_DIR, "..");
const SRC = join(FRONTEND_ROOT, "src");
const DATA_PATH = join(SCRIPT_DIR, "data", "public-curriculum.json");
const GRAMMAR_ROOT = join(FRONTEND_ROOT, "public", "grammar");
const OUTPUT_DIR = join(FRONTEND_ROOT, "public", "curriculum");
const SITE_URL = "https://teacherwang.xyz";

const CSS_FILES = [
  "styles/tokens.css",
  "styles/globals.css",
  "components/shared.css",
  "App.module.css",
  "components/Page.module.css",
  "components/Banner.module.css",
  "pages/GrammarPage.module.css",
];

// Only the row-lock override this static page needs on top of the real CSS:
// writing-practice rows are never clickable here (the real app's .grammar-row-writing
// is always cursor:pointer since progress there is per-user), and a locked row needs
// a hover reset since :hover normally follows .grammar-row/.grammar-row-writing.
const EXTRA_CSS = `
.grammar-row-writing { cursor: default; }
.grammar-row-writing:hover { background: none; }
`;

const LEVEL_LABELS: Record<number, string> = {
  1: "Beginner",
  2: "Elementary",
  3: "Intermediate",
  4: "Upper Intermediate",
  5: "Advanced",
  6: "Mastery",
};
const LEVEL_PALETTE_SIZE = 6;

const LOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="grammar-row-lock-icon"><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" /></svg>`;
const PEN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="grammar-row-writing-icon"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>`;

type GrammarPointRow = { id: string; title: string; hsk_level: number; index: number };
type WritingPracticeRow = { id: string; title: string; after_grammar_point: string };
type CurriculumExport = {
  grammar_points: GrammarPointRow[];
  writing_practices: WritingPracticeRow[];
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildStylesheet(): string {
  const parts = CSS_FILES.map((relPath) => readFileSync(join(SRC, relPath), "utf-8"));
  parts.push(EXTRA_CSS);
  return parts.join("\n\n");
}

function hasPublishedPage(id: string): boolean {
  return existsSync(join(GRAMMAR_ROOT, id, "index.html"));
}

function renderPage(data: CurriculumExport): string {
  const byLevel = new Map<number, GrammarPointRow[]>();
  for (const point of data.grammar_points) {
    const bucket = byLevel.get(point.hsk_level);
    if (bucket) bucket.push(point);
    else byLevel.set(point.hsk_level, [point]);
  }

  const sections = [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, points]) => {
      const sorted = points.slice().sort((a, b) => a.index - b.index);
      const paletteIndex = ((level - 1) % LEVEL_PALETTE_SIZE) + 1;

      const rows = sorted
        .map((point) => {
          const clickable = level === 1 && hasPublishedPage(point.id);
          const titleCell = clickable
            ? `<a href="/grammar/${point.id}/">${escapeHtml(point.title)}</a>`
            : `${LOCK_ICON}<span class="grammar-row-title-text">${escapeHtml(point.title)}</span>`;
          const rowClass = clickable ? "grammar-row" : "grammar-row grammar-row-locked";

          const practiceRows = data.writing_practices
            .filter((practice) => practice.after_grammar_point === point.id)
            .map(
              (practice) => `<tr class="grammar-row-writing grammar-row-writing-${paletteIndex}">
    <td></td>
    <td class="grammar-row-title">${PEN_ICON}<span class="grammar-row-title-text">Practice: ${escapeHtml(practice.title)}</span></td>
  </tr>`,
            )
            .join("\n");

          return `<tr class="${rowClass}">
    <td>${point.index}</td>
    <td class="grammar-row-title">${titleCell}</td>
  </tr>
  ${practiceRows}`;
        })
        .join("\n");

      return `<details open class="grammar-level-section grammar-level-section-${paletteIndex}">
  <summary class="grammar-level-summary">HSK ${level} (${LEVEL_LABELS[level] ?? `Level ${level}`})</summary>
  <table class="grammar-table">
    <thead><tr><th class="grammar-table-col-number">#</th><th>Lesson</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</details>`;
    })
    .join("\n");

  const title = "Chinese Grammar Curriculum | Teacher Wang";
  const description =
    "The full HSK grammar curriculum used by Teacher Wang, organized by level. HSK 1 lessons are free to read.";
  const url = `${SITE_URL}/curriculum/`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <link rel="stylesheet" href="/curriculum/curriculum.css" />
  </head>
  <body>
    <main class="app-main">
    <section class="page">
      <header class="page-header">
        <h1>Curriculum</h1>
        <div class="page-header-actions">
          <a class="btn btn-cancel btn-page" href="${SITE_URL}/">&larr; teacherwang.xyz</a>
        </div>
      </header>
      <div class="page-content">
        <div class="app-banner" role="status">
          <p class="app-banner-text">This is a limited preview with some features disabled. Create a free account at teacherwang.xyz for the full experience.</p>
          <a class="btn btn-confirm btn-banner" href="${SITE_URL}/">Sign up free</a>
        </div>
        ${sections}
      </div>
    </section>
    </main>
  </body>
</html>
`;
}

function main() {
  if (!existsSync(DATA_PATH)) {
    console.error(
      `Missing ${DATA_PATH} — run 'python3 -m backend.jobs.generate_public_curriculum' first.`,
    );
    process.exit(1);
  }
  const data: CurriculumExport = JSON.parse(readFileSync(DATA_PATH, "utf-8"));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "curriculum.css"), buildStylesheet());
  writeFileSync(join(OUTPUT_DIR, "index.html"), renderPage(data));

  console.log(`Generated /curriculum/ (${data.grammar_points.length} grammar points)`);
}

main();
