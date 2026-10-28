/**
 * Measure the rendered width of the dashboard's queue tables.
 *
 * The queue panels sit in a half-width grid, so a table with a large
 * `min-width` overflows and its last column gets clipped. This prints the
 * computed geometry so the right `minWidth` can be chosen.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";
const URL_PATH = process.argv[3] || "/app/admin";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@freshtrace.com");
await page.fill('input[name="password"]', "FreshTrace!2026");
await page.click('button[type="submit"]');
await page.waitForURL(/\/app\/admin(\/|$)/, { timeout: 15000 });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  return [...document.querySelectorAll("table")].map((table) => {
    const wrap = table.parentElement;
    return {
      minWidth: getComputedStyle(table).minWidth,
      tableWidth: Math.round(table.getBoundingClientRect().width),
      wrapWidth: Math.round(wrap.getBoundingClientRect().width),
      wrapScrollWidth: wrap.scrollWidth,
      wrapClientWidth: wrap.clientWidth,
      overflows: wrap.scrollWidth > wrap.clientWidth,
    };
  });
});

console.log(JSON.stringify(info, null, 1));

await browser.close();
