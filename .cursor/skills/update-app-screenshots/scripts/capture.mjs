import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/screenshots");
const BASE_URL = process.env.APP_URL ?? "http://localhost:5173";
const VIEWPORT = { width: 1440, height: 900 };

async function waitForSettled(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

async function goToNav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await waitForSettled(page);
}

async function screenshot(page, name) {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`Wrote ${filePath}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForSettled(page);

  // 1. HomePage (default)
  await screenshot(page, "01-home");

  // 2. Knowledge base — view mode
  await goToNav(page, "Knowledge base");
  await screenshot(page, "02-knowledge-base-view");

  // 3. Knowledge base — edit mode
  await page.getByRole("button", { name: "Modify", exact: true }).click();
  await waitForSettled(page);
  await screenshot(page, "03-knowledge-base-edit");

  // 4. Chat
  await goToNav(page, "Chat");
  await screenshot(page, "04-chat");

  // 5. Chat after opening the Waiter challenge
  await page.getByRole("button", { name: /Waiter/ }).click();
  await waitForSettled(page);
  await screenshot(page, "05-chat-challenge-waiter");

  // Close chat modal before navigating away (overlay blocks navbar clicks)
  await page.getByRole("button", { name: "Close chat" }).click();
  await waitForSettled(page);

  // 6. Preferences
  await goToNav(page, "Preferences");
  await screenshot(page, "06-preferences");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
