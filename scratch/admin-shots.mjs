/**
 * Capture screenshots of the admin & QC operations panel.
 *
 * Used to eyeball the visual result against the design reference: the warm
 * cream canvas, the golden accent, the pill navigation, the KPI cards and
 * the data tables.
 *
 * Usage: node scratch/admin-shots.mjs [base-url]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.resolve("scratch/shots");

mkdirSync(OUT, { recursive: true });

const PAGES = [
  { slug: "dashboard", url: "/app/admin", auth: true },
  { slug: "batches", url: "/app/admin/batches", auth: true },
  { slug: "orders", url: "/app/admin/orders", auth: true },
  { slug: "subscriptions", url: "/app/admin/subscriptions", auth: true },
  { slug: "settings", url: "/app/admin/settings", auth: true },
];

const browser = await chromium.launch();

/**
 * Capture the unified login page in its own context.
 *
 * There is one sign-in page for the whole application, so this is the same
 * `/login` an operator uses. It is shot in a context that has never
 * authenticated, so the form is on screen rather than the dashboard.
 */
{
  const anon = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const tab = await anon.newPage();
  await tab.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await tab.waitForTimeout(400);
  await tab.screenshot({
    path: path.join(OUT, "login.png"),
    fullPage: true,
  });
  console.log("captured login (signed out)");
  await anon.close();
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});

// Sign in once so the authenticated pages are reachable. The unified form
// sends the operations credential straight to the panel.
const login = await context.newPage();
await login.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await login.fill('input[name="email"]', "admin@freshtrace.com");
await login.fill('input[name="password"]', "FreshTrace!2026");
await login.click('button[type="submit"]');
await login.waitForURL(/\/app\/admin(\/|$)/, { timeout: 15000 });
console.log("signed in");

for (const page of PAGES) {
  const tab = await context.newPage();
  await tab.goto(`${BASE}${page.url}`, { waitUntil: "networkidle" });
  // Let the frosted surfaces settle their blur.
  await tab.waitForTimeout(400);
  const file = path.join(OUT, `${page.slug}.png`);
  await tab.screenshot({ path: file, fullPage: true });
  console.log(`captured ${page.slug} -> ${file}`);
  await tab.close();
}

await browser.close();
console.log("done");
