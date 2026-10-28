/**
 * Inspect the rendered "Admin Dashboard" link in the storefront navbar.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@freshtrace.test");
await page.fill('input[name="password"]', "FreshTrace!2026");
await page.click('button[type="submit"]');
await page.waitForURL(/\/app\/products/, { timeout: 15000 });

await page.goto(`${BASE}/app/products`, { waitUntil: "networkidle" });

const info = await page.evaluate(() => {
  const a = document.querySelector('a[href="/app/admin"]');
  if (!a) return { found: false };

  const r = a.getBoundingClientRect();
  return {
    found: true,
    href: a.getAttribute("href"),
    outerHTML: a.outerHTML.slice(0, 300),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    visible: r.width > 0 && r.height > 0,
    inMainNav: Boolean(a.closest('nav[aria-label="Main"]')),
    // What sits on top of the element's centre, if anything.
    topElement: (() => {
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el ? `${el.tagName}.${el.className}`.slice(0, 160) : null;
    })(),
  };
});

console.log(JSON.stringify(info, null, 1));

await browser.close();
