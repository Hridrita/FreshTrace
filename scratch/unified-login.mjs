/**
 * Verify the unified `/login` page.
 *
 * Two cases:
 *   1. A regular customer signs in on `/login` and lands on the catalogue.
 *   2. The operations operator signs in on the *same* `/login` page and lands
 *      on the admin panel.
 *
 * Plus the guard path: an operator with no panel session who clicks the
 * navbar's "Admin Dashboard" link is sent to `/login`, not to a retired
 * `/app/admin/login` route.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";

const browser = await chromium.launch();

/**
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
  await page.waitForTimeout(2500);
  const url = page.url();
  await page.close();
  return url;
}

// ── 1. A regular customer ─────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const url = await signIn(ctx, "customer.tareq@freshtrace.test", "FreshTrace!2026");
  console.log(`customer → ${new URL(url).pathname}`);
  console.log(`  landed on the catalogue: ${new URL(url).pathname === "/app/products"}`);

  const cookies = await ctx.cookies();
  console.log(`  ft_session set:         ${cookies.some((c) => c.name === "ft_session")}`);
  console.log(`  ft_admin_session set:   ${cookies.some((c) => c.name === "ft_admin_session")}`);
  await ctx.close();
}

// ── 2. The operations operator, same page ──────────────────────────
{
  const ctx = await browser.newContext();
  const url = await signIn(ctx, "admin@freshtrace.com", "AdminPassword123!");
  console.log(`operator → ${new URL(url).pathname}`);
  console.log(`  landed on the admin panel: ${new URL(url).pathname === "/app/admin"}`);

  const cookies = await ctx.cookies();
  console.log(`  ft_admin_session set:   ${cookies.some((c) => c.name === "ft_admin_session")}`);
  console.log(`  ft_session set:         ${cookies.some((c) => c.name === "ft_session")}`);

  // The panel must actually be there, not an error page.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/admin`, { waitUntil: "networkidle" });
  const seesDashboard = await page.locator("text=Operations overview").count();
  console.log(`  dashboard rendered:      ${seesDashboard > 0}`);
  await ctx.close();
}

// ── 3. The retired route is gone ──────────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const response = await page.goto(`${BASE}/app/admin/login`, { waitUntil: "networkidle" });
  console.log(`/app/admin/login → ${response.status()}`);
  await ctx.close();
}

// ── 4. The guard sends an operator to the unified login page ───────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Sign in as the storefront's staff admin, then try the panel.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "admin@freshtrace.test");
  await page.fill('input[name="password"]', "FreshTrace!2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/products/, { timeout: 15000 });

  await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle" });
  await page.locator('a[href="/app/admin"]').click();
  await page.waitForURL(/\/login|\/app\/admin/, { timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log(`guard → ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
  console.log(`  sent to the unified login: ${new URL(page.url()).pathname === "/login"}`);

  const seesLoginForm = await page.locator('input[name="password"]').count();
  console.log(`  sign-in form present:      ${seesLoginForm > 0}`);

  await page.screenshot({ path: "scratch/shots/unified-login-guard.png", fullPage: true });
  console.log("  captured scratch/shots/unified-login-guard.png");
  await ctx.close();
}

await browser.close();
console.log("done");
