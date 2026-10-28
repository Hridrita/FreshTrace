/**
 * Capture the main storefront navbar for an admin and a plain customer.
 *
 * The "Admin Dashboard" link is gated on the account's role, so the two
 * screenshots are the evidence that the gate works: the admin sees the
 * link, the customer does not.
 *
 * Usage: node scratch/navbar-shots.mjs [base-url]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.resolve("scratch/shots");

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

/**
 * Sign in through the customer login form.
 *
 * @param {import("playwright").BrowserContext} context
 * @param {string} email
 * @param {string} password
 */
async function signIn(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/products/, { timeout: 15000 });
  await page.close();
}

/**
 * Capture the header of the catalogue page.
 *
 * @param {import("playwright").BrowserContext} context
 * @param {string} slug
 */
async function shootHeader(context, slug) {
  const page = await context.newPage();
  await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const header = await page.$("header");
  const file = path.join(OUT, `navbar-${slug}.png`);
  await header.screenshot({ path: file });
  console.log(`captured ${slug} -> ${file}`);

  const hasAdminLink = await page.evaluate(() =>
    Boolean(document.querySelector('a[href="/app/admin"]')),
  );
  console.log(`  admin link present: ${hasAdminLink}`);

  await page.close();
  return hasAdminLink;
}

// The seeded admin account. Note this is `admin@freshtrace.test` — the
// *staff* account in the customer directory. `admin@freshtrace.com` is the
// separate operations-panel operator, whose password hash is deliberately
// unusable so it can only sign in through the admin panel itself.
const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  await signIn(admin, "admin@freshtrace.test", "FreshTrace!2026");
  await shootHeader(admin, "admin");
} catch (err) {
  console.log(`admin sign-in failed: ${err.message.split("\n")[0]}`);
}

await admin.close();

const customer = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  await signIn(customer, "customer.tareq@freshtrace.test", "FreshTrace!2026");
  await shootHeader(customer, "customer");
} catch (err) {
  console.log(`customer sign-in failed: ${err.message.split("\n")[0]}`);
}

await customer.close();
await browser.close();
console.log("done");
