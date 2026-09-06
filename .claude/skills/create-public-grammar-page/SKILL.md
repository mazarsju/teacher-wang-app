---
name: create-public-grammar-page description: >- Generates a static, logged-out HTML page for one grammar rule at public/grammar/<id>/, styled identically to the authenticated app's 3-tab grammar detail page (Explanation/Exercises/Vocabulary) but with every backend/API-calling button removed. Use when the user asks to publish a grammar rule publicly, add a public grammar page, or make a grammar point visible without login for SEO.
---

# Create a public grammar page

Publishes one HSK grammar rule as a static, crawlable page at `teacherwang.xyz/grammar/<id>/` — same visual design as the real, authenticated `GrammarPointDetailPage` (3 tabs, same CSS), but with zero backend calls: no "Ask Teacher Wang" AI chat, no "Skip this lesson", no save-progress/score, no add-to-knowledge-base. See `docs/seo-archi-decision.md` (item 6) in the sibling `teacher-wang-infra` repo for why this exists.

## Why this design (read before changing it)

- **Real CSS, not a rewrite**: the generator reads the actual `.module.css`/`shared.css`/`tokens.css`/`globals.css` files straight off disk and concatenates them verbatim into `public/grammar/grammar.css`. It does not hand-author styles. If the real app's grammar page styling changes, regenerating picks it up automatically — don't hardcode a CSS copy here.
- **Real markup, not a simplified layout**: the HTML mirrors `GrammarPointDetailPage.tsx`'s actual DOM (`page` / `page-header` / `grammar-detail-tabs` / `grammar-detail-explanation` classes, etc.) so the CSS applies identically. Check that file before changing this skill's page structure — drift between them is the bug to avoid.
- **No React/Vite/SSR for the output**: this is plain HTML + one shared vanilla-JS file (`public/grammar/grammar-runtime.js`), so pages work with zero client framework and stay crawlable. `grammar-runtime.js` is a manual port of `GrammarExercises.tsx`'s client-only logic (multiple choice / reordering / translation / transform checking, score gauge) with the AI-explanation fallback and "More explanation" chat button deleted — those are the only two things in the real component that call the backend.
- **Explanation and vocabulary are server-rendered** (fully present in the raw HTML, good for SEO); **exercises render via `grammar-runtime.js`** on load (interactive, but not in the raw HTML) — an accepted trade-off for keeping real practice interactivity without shipping React.

## Prerequisites

- A local Postgres with grammar content loaded (`DATABASE_URL` in `.env`; run the backend's normal migrations/`reload_grammar_content` flow if empty) — vocabulary needs the `hsk_words` table.
- `GRAMMAR_CONTENT_S3_PATH` (or `GRAMMAR_CONTENT_S3_BUCKET`) set in `.env`, pointing at a `teacher-wang-grammar`-shaped content tree.

## Steps

1. **Export the rule's content** (backend, needs the Python venv):

   ```bash
   source venv/bin/activate
   set -a && source .env && set +a
   python3 -m backend.jobs.generate_public_grammar_pages --id <grammar-id>
   ```

   Writes `frontend/scripts/data/public-grammar-content.json` (gitignored — a derived build input, not source of truth) with `{id, title, hsk_level, explanation, exercises, new_words}` for that one rule. Drop `--id` to export a whole `--hsk-level` instead, then run step 2 once per id.

2. **Generate the page** (frontend):

   ```bash
   cd frontend
   npm run generate:public-grammar-page -- <grammar-id>
   ```

   Writes `public/grammar/<grammar-id>/index.html`, (re)writes `public/grammar/grammar.css` from the current real CSS files, and regenerates `public/sitemap.xml` by scanning every folder already under `public/grammar/` (so it always reflects what's actually published — no manually-maintained URL list).

3. **Verify before trusting it**:

   ```bash
   npm run build   # tsc -b && vite build — confirms nothing else broke
   python3 -m http.server 8123 --directory public   # or any static server
   ```

   Open `http://localhost:8123/grammar/<grammar-id>/` and check: all 3 tabs render and switch, an exercise can be answered and validated with correct/incorrect feedback, the score screen appears after the last question, the vocabulary table lists real words, and the header's "← teacherwang.xyz" link points at the real site. Compare side-by-side against the same rule in the logged-in app if unsure about visual parity.

4. **Deploy**: same pipeline as any other frontend change — `.cursor/skills/update-ecr-images/scripts/push.sh frontend` (or the plain `docker build` + ECS force-deploy steps in that skill) once committed.

## Extending the CSS/markup set

If a future rule's explanation uses a formatting feature not yet covered (e.g. a table or `[!TIP]` callout), verify `frontend/scripts/lib/markdownToHtml.ts` (a plain-string port of `frontend/src/utils/formatMarkdownText.tsx`) still matches the real component's class names — it must stay a faithful port, not drift into its own styling.

If the real `GrammarPointDetailPage.tsx` / `GrammarExercises.tsx` markup changes (new CSS classes, restructured DOM), update `frontend/scripts/generate-public-grammar-page.ts` (page shell / vocabulary table markup) and `frontend/public/grammar/grammar-runtime.js` (exercise DOM) to match — both are deliberately hand-synced copies, not shared imports, because the real components import React/Redux/i18n and API clients that don't belong in a static, backend-free page.

## Do not add back

These exist in the real page and must **not** appear here — that's the entire point of this skill:

- "Ask Teacher Wang" button / `ChatModal` (AI chat)
- "Skip this lesson" button (`skipGrammarPoint` API)
- Saving quiz score (`completeGrammarPoint` API) — the score gauge still shows locally, it just isn't persisted anywhere
- "More explanation" button and the AI-checks-your-answer fallback for translation/transform exercises (`sendChatMessage` API) — those exercises only get the deterministic (exact-match) check
- "Add" button on vocabulary rows (`createWord`/`bulkCreateCharacters` API)
- The authenticated app's `Navbar` (Home/Knowledge Base/Chat/Preferences/Admin) — replaced by a single link back to `https://teacherwang.xyz/`

## Done criteria

- `public/grammar/<id>/index.html` exists, matches the real page's look (tabs, fonts, colors, spacing)
- Explanation tab shows fully formatted content with zero JS required
- Exercises tab lets you answer every exercise type present and reach a score screen, entirely client-side
- Vocabulary tab lists real word/pinyin/definition rows with no "Add" button
- No `fetch`/`XMLHttpRequest` to `/api/...` anywhere in the page (check the Network tab — should be empty other than the HTML/CSS/JS/favicon)
- `public/sitemap.xml` includes the new URL
