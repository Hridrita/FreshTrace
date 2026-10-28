/**
 * Check the navbar link → panel guard → unified login flow.
 *
 * Three cases:
 *   1. Signed out entirely: the navbar has no admin link.
 *   2. Signed in as admin, no panel session: clicking the link lands on the
 *      unified login page.
 *   3. Signed in as admin *with* a panel session: clicking the link lands
 *      on the dashboard.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";

const browser = await chromium.launch();

/**
 * Sign in through the customer login form.
 *
 * @param {import("playwright").BrowserContext} context
 */
async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "admin@freshtrace.test");
  await page.fill('input[name="password"]', "FreshTrace!2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/products/, { timeout: 15000 });
  await page.close();
}

/**
 * Sign in to the operations panel.
 *
 * There is a single sign-in page for the whole application: the operations
 * credential on `/login` opens the admin session and lands on the panel.
 *
 * @param {import("playwright").BrowserContext} context
 */
async function signInToPanel(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "admin@freshtrace.com");
  await page.fill('input[name="password"]', "FreshTrace!2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/admin(\/|$)/, { timeout: 15000 });
  await page.close();
}

// ── 1. Signed out ──────────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle" });

  const linkCount = await page.locator('a[href="/app/admin"]').count();
  console.log(`signed out   → admin links in navbar: ${linkCount}`);
  await ctx.close();
}

// ── 2. Admin signed in, no panel session ───────────────────────────────
{
  const ctx = await browser.newContext();
  await signIn(ctx);

  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle" });

  const linkCount = await page.locator('a[href="/app/admin"]').count();
  console.log(`admin signed in → admin links in navbar: ${linkCount}`);

  await page.locator('a[href="/app/admin"]').click();
  // The guard answers with a 307, so wait for the URL to settle rather than
  // for a load event that may have already fired for the old page.
  await page.waitForURL(/\/app\/admin/, { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log(`  click → ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
  console.log(`  landed on the login page: ${page.url().includes("/login")}`);

  // What the visitor actually sees: the sign-in form, or the dashboard?
  const seesLoginForm = await page.locator('input[name="password"]').count();
  const seesDashboard = await page.locator('text=Operations overview').count();
  console.log(`  sign-in form present: ${seesLoginForm > 0}`);
  console.log(`  dashboard present:    ${seesDashboard > 0}`);

  await page.screenshot({ path: "scratch/shots/navbar-click-login.png", fullPage: true });
  console.log("  captured scratch/shots/navbar-click-login.png");

  await ctx.close();
}

// ── 3. Admin signed in with a panel session ────────────────────────────
{
  const ctx = await browser.newContext();
  await signIn(ctx);
  await signInToPanel(ctx);

  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle" });

  await page.locator('a[href="/app/admin"]').click();
  await page.waitForURL(/\/app\/admin/, { timeout: 15000 });

  console.log(`  click (with panel session) → ${new URL(page.url()).pathname}`);
  console.log(`  reached the dashboard: ${new URL(page.url()).pathname === "/app/admin"}`);

  await ctx.close();
}

await browser.close();
console.log("done");
