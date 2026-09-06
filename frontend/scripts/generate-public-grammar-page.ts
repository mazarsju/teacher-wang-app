/**
 * Generates one static, logged-out grammar page at public/grammar/<id>/index.html.
 * Backing script for the create-public-grammar-page skill — see
 * .claude/skills/create-public-grammar-page/SKILL.md for the full procedure.
 *
 * Usage: npm run generate:public-grammar-page -- <grammar-id>
 * (run `python3 -m backend.jobs.generate_public_grammar_pages --id <grammar-id>` first)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderExplanationHtml, stripMarkdownToText } from "./lib/markdownToHtml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(SCRIPT_DIR, "..");
const SRC = join(FRONTEND_ROOT, "src");
const DATA_PATH = join(SCRIPT_DIR, "data", "public-grammar-content.json");
const OUTPUT_ROOT = join(FRONTEND_ROOT, "public", "grammar");
const SITE_URL = "https://teacherwang.xyz";

// The exact same stylesheets the authenticated app uses for this page, concatenated
// as-is (unhashed selectors — these .module.css files are plain CSS on disk; Vite
// only hashes them when bundling the app itself, which this script bypasses).
const CSS_FILES = [
  "styles/tokens.css",
  "styles/globals.css",
  "components/shared.css",
  "App.module.css",
  "components/Page.module.css",
  "components/Banner.module.css",
  "pages/GrammarPointDetailPage.module.css",
  "components/GrammarExercises.module.css",
  "components/Table.module.css",
  "utils/formatMarkdownText.module.css",
];

// Only the two classes GrammarVocabularyTab needs from KnowledgeBaseInitWizardModal.module.css —
// not pulling in that whole (unrelated) modal's stylesheet for two rules. Plus a small
// reset: the real app renders each explanation line as its own <span> (no margin); this
// generator groups them into <p> paragraphs instead (simpler to generate), so the default
// browser <p> margin needs zeroing or paragraphs get double-spaced (flex `gap` + <p> margin).
const EXTRA_CSS = `
.wizard-word-cell-primary { margin: 0; font-weight: 700; color: var(--app-ink); }
.wizard-word-cell-definition { margin: 0.15rem 0 0; color: #4b5563; font-size: 0.85rem; }
.explanation-para { margin: 0; }
`;

type HskWordExport = { word: string; pinyin: string; definition: string };
type GrammarPointExport = {
  id: string;
  title: string;
  hsk_level: number;
  explanation: string | null;
  exercises: unknown[] | null;
  new_words: HskWordExport[];
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function buildStylesheet(): string {
  const parts = CSS_FILES.map((relPath) => readFileSync(join(SRC, relPath), "utf-8"));
  parts.push(EXTRA_CSS);
  return parts.join("\n\n");
}

function renderVocabularyTable(words: HskWordExport[]): string {
  if (words.length === 0) {
    return `<p class="table-empty">No new words for this lesson.</p>`;
  }
  const rows = words
    .map(
      (word) => `<tr>
    <td>
      <p class="wizard-word-cell-primary">${escapeHtml(word.word)} - ${escapeHtml(word.pinyin)}</p>
      <p class="wizard-word-cell-definition">(${escapeHtml(word.definition)})</p>
    </td>
  </tr>`,
    )
    .join("\n");
  return `<div class="table-wrapper table-wrapper--compact">
  <table class="table table--compact">
    <thead><tr><th>Word</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function renderPage(point: GrammarPointExport): string {
  const title = `${point.title} — HSK ${point.hsk_level} Chinese Grammar | Teacher Wang`;
  const description = point.explanation
    ? stripMarkdownToText(point.explanation)
    : `Learn "${point.title}", an HSK ${point.hsk_level} Mandarin Chinese grammar point.`;
  const url = `${SITE_URL}/grammar/${point.id}/`;

  // The explanation's own leading "# Title" line duplicates the page's <h1>.
  const explanationBody = point.explanation?.replace(/^#\s+.*\n+/, "") ?? null;
  const explanationHtml = explanationBody
    ? renderExplanationHtml(explanationBody)
    : "<p>Explanation coming soon.</p>";

  const exercisesJson = JSON.stringify(point.exercises ?? []).replace(/</g, "\\u003c");
  const vocabularyHtml = renderVocabularyTable(point.new_words ?? []);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>${escapeAttr(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <link rel="stylesheet" href="/grammar/grammar.css" />
  </head>
  <body>
    <main class="app-main">
    <section class="page">
      <header class="page-header">
        <h1>${escapeHtml(point.title)}</h1>
        <div class="page-header-actions">
          <a class="btn btn-cancel btn-page" href="${SITE_URL}/curriculum/">View all lessons</a>
        </div>
      </header>
      <div class="page-content">
        <div class="app-banner" role="status">
          <p class="app-banner-text">This is a limited preview with some features disabled. Create a free account at teacherwang.xyz for the full experience.</p>
          <a class="btn btn-confirm btn-banner" href="${SITE_URL}/">Sign up free</a>
        </div>
        <div class="grammar-detail-tabs" role="tablist">
          <button type="button" role="tab" class="grammar-detail-tab grammar-detail-tab-active" data-tab-button="explanation" aria-selected="true">Explanation</button>
          <button type="button" role="tab" class="grammar-detail-tab" data-tab-button="exercises" aria-selected="false">Exercises</button>
          <button type="button" role="tab" class="grammar-detail-tab" data-tab-button="vocabulary" aria-selected="false">Vocabulary</button>
        </div>
        <div class="grammar-detail-explanation" data-tab-panel="explanation">
          ${explanationHtml}
        </div>
        <div data-tab-panel="exercises" class="grammar-detail-hidden">
          <div id="exercises-root"></div>
          <script type="application/json" id="exercise-data">${exercisesJson}</script>
        </div>
        <div data-tab-panel="vocabulary" class="grammar-detail-hidden">
          ${vocabularyHtml}
        </div>
      </div>
    </section>
    </main>
    <script src="/grammar/grammar-runtime.js" defer></script>
  </body>
</html>
`;
}

function updateSitemap() {
  const grammarIds = existsSync(OUTPUT_ROOT)
    ? readdirSync(OUTPUT_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "monthly", priority: "1.0" },
    { loc: `${SITE_URL}/curriculum/`, changefreq: "weekly", priority: "0.8" },
    ...grammarIds.map((id) => ({
      loc: `${SITE_URL}/grammar/${id}/`,
      changefreq: "monthly",
      priority: "0.6",
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;
  writeFileSync(join(FRONTEND_ROOT, "public", "sitemap.xml"), xml);
}

function main() {
  const grammarId = process.argv[2];
  if (!grammarId) {
    console.error("Usage: npm run generate:public-grammar-page -- <grammar-id>");
    process.exit(1);
  }
  if (!existsSync(DATA_PATH)) {
    console.error(
      `Missing ${DATA_PATH} — run 'python3 -m backend.jobs.generate_public_grammar_pages --id ${grammarId}' first.`,
    );
    process.exit(1);
  }

  const points: GrammarPointExport[] = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  const point = points.find((p) => p.id === grammarId);
  if (!point) {
    console.error(`${grammarId} not found in ${DATA_PATH} (wrong --id when exporting?)`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeFileSync(join(OUTPUT_ROOT, "grammar.css"), buildStylesheet());

  const pageDir = join(OUTPUT_ROOT, point.id);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, "index.html"), renderPage(point));

  updateSitemap();
  console.log(`Generated /grammar/${point.id}/`);
}

main();
