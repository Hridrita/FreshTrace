/**
 * Focused smoke test for the subscription setup page's inline address form
 * and the product page's subscription button.
 *
 * The customer state drives which face of each page is shown, so this script
 * walks a customer through both: no address → inline form; with a saved
 * address → the "Deliver somewhere else" button; with an active plan → the
 * product page's "View my weekly subscription" button.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

let cookie = "";
let passed = 0;
let failed = 0;

/**
 * @param {string} label
 * @param {boolean} ok
 * @param {string} [detail]
 */
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * @param {string} html
 * @param {string} needle
 */
function has(html, needle) {
  return html.includes(needle);
}

/**
 * @param {string} html
 */
function strip(html) {
  return html
    .replace(/<!--\s*-->/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function req(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "manual",
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const pair = setCookie.split(";")[0];
    if (pair.startsWith("ft_session=")) cookie = pair;
  }

  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }

  return { status: response.status, text, body };
}

const email = `smoke.subs.${Date.now()}@test.local`;

// ─── 1. Sign in with no saved address ──────────────────────────────────────
console.log("\n1. A customer with no saved address");
{
  const res = await req("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "SmokePass123!", name: "Smoke Subs" }),
  });
  check("register returns 201", res.status === 201, `got ${res.status}`);

  const page = await req("/app/subscriptions");
  const html = strip(page.text);

  check("the page returns 200", page.status === 200, `got ${page.status}`);
  check(
    "it explains that an address is needed",
    has(html, "You need a saved delivery address before you can subscribe"),
  );
  check("it offers the inline address form", has(html, "Where should we deliver?"));
  check("the inline form has a Save address button", has(html, "Save address"));
  check(
    "the inline form has no cancel button with no saved address",
    !has(html, "Cancel"),
  );
}

// ─── 2. Save an address inline, then the select appears ────────────────────
console.log("\n2. Saving an address inline");
let addressId = "";
{
  const create = await req("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    }),
  });
  addressId = create.body?.data?.id ?? "";
  check("the address is saved", create.status === 201, `got ${create.status}`);

  const page = await req("/app/subscriptions");
  const html = strip(page.text);

  check("the address is in the dropdown", has(html, "Home"));
  check("it offers 'Deliver somewhere else'", has(html, "Deliver somewhere else"));
  check("the inline form is not open by default", !has(html, "Where should we deliver?"));
}

// ─── 3. The product page button, with and without an active plan ───────────
console.log("\n3. The product page subscription button");
{
  const products = await req("/api/products");
  const sku = products.body?.data?.[0]?.sku ?? "";
  check("there is a product to open", Boolean(sku));

  const before = await req(`/app/products/${sku}`);
  const beforeHtml = strip(before.text);
  check("the product page returns 200", before.status === 200, `got ${before.status}`);
  check(
    "without a plan it says 'Start a weekly subscription'",
    has(beforeHtml, "Start a weekly subscription"),
  );
  check("it links to the subscriptions page", has(beforeHtml, 'href="/app/subscriptions"'));
  check(
    "without a plan it does not say 'View my weekly subscription'",
    !has(beforeHtml, "View my weekly subscription"),
  );

  // Start a plan.
  const plans = await req("/api/subscriptions/plans");
  const planId = plans.body?.data?.[0]?.id ?? "";
  const sub = await req("/api/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, addressId, dayOfWeek: 5 }),
  });
  check("the subscription starts", sub.status === 201, `got ${sub.status}`);

  const after = await req(`/app/products/${sku}`);
  const afterHtml = strip(after.text);
  check(
    "with a plan it says 'View my weekly subscription'",
    has(afterHtml, "View my weekly subscription"),
  );
  check(
    "with a plan it no longer says 'Start a weekly subscription'",
    !has(afterHtml, "Start a weekly subscription"),
  );

  // The navbar carries the active marker.
  const nav = await req("/app/products");
  const navHtml = strip(nav.text);
  check(
    "the navbar marks the active subscription",
    has(navHtml, "You have an active subscription"),
  );
}

// ─── 4. A signed-out visitor sees the setup prompt, not the form ───────────
console.log("\n4. A signed-out visitor");
{
  const saved = cookie;
  cookie = "";
  const res = await req("/app/subscriptions");
  check("the page redirects to login", res.status === 307 || res.status === 302, `status ${res.status}`);
  cookie = saved;
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
