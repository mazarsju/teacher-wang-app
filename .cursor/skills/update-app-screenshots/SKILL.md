---
name: update-app-screenshots
description: >-
  Starts the teacher-wang frontend and backend, captures fresh UI screenshots
  into docs/screenshots/, then updates the README.md Feature section with those
  images. Use when the user asks to update app screenshots, refresh README/docs
  screenshots, or re-capture Home, Knowledge base, Chat, or Preferences screens.
---

# Update app screenshots

Capture the current teacher-wang UI into `docs/screenshots/`, then insert those
screenshots into `README.md` under a **Feature** section placed after
**Getting started**.

## Screenshots to capture

Take the following screenshots:

- 1 in the HomePage
- 1 in the Knowledge base (view mode, meaning the default view)
- 1 in the Knowledge base (edit mode, meaning after clicking on the "Modify" button)
- 1 in the Chat
- 1 in the Chat after clicking on the **Waiter** challenge card (chat modal open)
- 1 in the Preferences

## Output files

| File | Screen |
| --- | --- |
| `docs/screenshots/01-home.png` | HomePage |
| `docs/screenshots/02-knowledge-base-view.png` | Knowledge base (view) |
| `docs/screenshots/03-knowledge-base-edit.png` | Knowledge base (edit / after Modify) |
| `docs/screenshots/04-chat.png` | Chat |
| `docs/screenshots/05-chat-challenge-waiter.png` | Chat with Waiter challenge modal open |
| `docs/screenshots/06-preferences.png` | Preferences |

## Workflow

Copy this checklist and track progress:

```
Screenshot update:
- [ ] Backend running on http://localhost:5000
- [ ] Frontend running on http://localhost:5173
- [ ] Playwright Chromium available
- [ ] Capture script ran successfully
- [ ] All 6 PNGs exist and look correct
- [ ] README.md Feature section updated after Getting started
```

### 1. Start backend (if not already running)

From the repo root:

```bash
source venv/bin/activate
python3 -m backend.app
```

Health check: `curl -s http://127.0.0.1:5000/health` → `{"status":"ok"}`.

### 2. Start frontend (if not already running)

```bash
cd frontend && npm run dev
```

Health check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/` → `200`.
Use `http://localhost:5173` (not `127.0.0.1`) — Vite may bind IPv6-only.

### 3. Install Playwright deps (first run / when missing)

```bash
cd .cursor/skills/update-app-screenshots/scripts
npm install
npx playwright install chromium
```

### 4. Capture screenshots

From the repo root:

```bash
node .cursor/skills/update-app-screenshots/scripts/capture.mjs
```

Optional: `APP_URL=http://localhost:5173` (default).

### 5. Verify screenshots

Confirm all six files above were written. Spot-check:

- Knowledge base view shows the pinyin grid and a **Modify** button
- Knowledge base edit shows character/word tables and a **View** button
- Chat Waiter challenge shows the chat modal for the Waiter (tasks panel visible)
- Preferences shows token usage and/or Anki synchronization (no LLM credentials UI)

### 6. Update README.md Feature section

After capturing (or refreshing) screenshots, insert or replace a **Feature** section
in `README.md` **immediately after** the **Getting started** section (before
**Roadmap**).

Note: if an **AI logic** section exists between Getting started and Feature, keep
Feature after AI logic (or wherever the repo currently places it), but keep the
Feature body structure below.

Use this structure and image paths. Write catchy copy where noted; keep the
Preferences blurb **verbatim**.

```markdown
## Feature

### Track your progress

[Catchy sentence about insightful metrics to keep track of your current HSK level
and what are the missing characters to reach the next step.]

![Home](docs/screenshots/01-home.png)

### Update your knowledge base

[Catchy sentence about adding your words in an intuitive design.]

![Knowledge base edit](docs/screenshots/03-knowledge-base-edit.png)

[Catchy sentence about having a nice visualization of all your known characters
grouped by pinyin to have a motivation visualization of your progress.]

![Knowledge base view](docs/screenshots/02-knowledge-base-view.png)

### Practice your skills with AI agents

After connecting the application with your favourite LLM, discuss with predefined
chat agents to practice your level.

![Preferences](docs/screenshots/06-preferences.png)

![Chat](docs/screenshots/04-chat.png)

![Chat with Waiter challenge](docs/screenshots/05-chat-challenge-waiter.png)

Step into real scenes: role-play with characters like the waiter, clear the
checklist, and win the challenge in Mandarin.
```

Rules:

- Section title is **Feature** (singular), not Features.
- Place it after **Getting started**, before **Roadmap** (respect existing
  sections such as **AI logic** if present).
- If a Feature section already exists, replace its body so images and order stay
  in sync with the latest screenshots.
- Image paths are relative to the repo root (`docs/screenshots/...`).
- Always include the short catchy line **below** the Waiter challenge screenshot.
- After a successful capture, remove obsolete `docs/screenshots/05-chat-xiao-ming.png`
  if it still exists.

## Notes

- Close the Waiter challenge chat modal before navigating to Preferences; the modal overlay blocks navbar clicks (the script already does this).
- Open the challenge via the **Waiter** card under the Challenges section (not Xiao Ming).
- Do not commit `scripts/node_modules/`.
- Prefer overwriting the existing PNGs in `docs/screenshots/` rather than creating new filenames (except when renaming Xiao Ming → Waiter challenge as above).
