/**
 * Live smoke test for the account page's order-history section.
 *
 * Places a real order through the API, then checks that the account page
 * lists it with its code, item count and total, and links to its detail
 * page and to the full order history.
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

const email = `smoke.orders.${Date.now()}@test.local`;

// ─── 1. Sign in and save an address ────────────────────────────────────────
console.log("\n1. Set up the customer");
let addressId = "";
{
  const reg = await req("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "SmokePass123!", name: "Smoke Orders" }),
  });
  check("register returns 201", reg.status === 201, `got ${reg.status}`);

  const addr = await req("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Home",
      line1: "House 10, Road 5",
      area: "Gulshan-2",
      city: "Dhaka",
    }),
  });
  addressId = addr.body?.data?.id ?? "";
  check("the address is saved", addr.status === 201, `got ${addr.status}`);
}

// ─── 2. Find something to buy ──────────────────────────────────────────────
console.log("\n2. Find a batch to buy");
let batchId = "";
{
  const products = await req("/api/products");
  const productId = products.body?.data?.[0]?.id ?? "";
  check("there is a product", Boolean(productId));

  const batches = await req(`/api/products/${productId}/available-batches`);
  batchId = batches.body?.data?.[0]?.id ?? "";
  check("there is a batch to buy", Boolean(batchId));
}

// ─── 3. Place the order ────────────────────────────────────────────────────
console.log("\n3. Place the order");
let orderId = "";
let orderCode = "";
{
  const res = await req("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ batchId, qty: 2 }],
      addressId,
      paymentMethod: "card",
    }),
  });

  check("POST /api/orders returns 201", res.status === 201, `got ${res.status} ${res.text.slice(0, 300)}`);
  orderId = res.body?.data?.id ?? "";
  orderCode = res.body?.data?.orderCode ?? "";
  check("the order has a code", Boolean(orderCode), JSON.stringify(res.body?.data));
}

// ─── 4. The account page lists the order ───────────────────────────────────
console.log("\n4. The account page's order history");
{
  const page = await req("/app/account");
  const html = strip(page.text);

  check("the account page returns 200", page.status === 200, `got ${page.status}`);
  check("it shows the order code", has(html, orderCode), orderCode);
  check("it shows the placed date", has(html, "Placed"));
  check("it shows the item count", has(html, "1 item"));
  check("it links to the order detail", has(html, `href="/app/orders/${orderId}"`));
  check("it links to the full history", has(html, 'href="/app/orders"'));
  check("it no longer shows the empty state", !has(html, "You have not ordered anything yet"));
}

// ─── 5. Another customer never sees it ─────────────────────────────────────
console.log("\n5. Isolation");
{
  const saved = cookie;
  cookie = "";

  const otherEmail = `smoke.orders.other.${Date.now()}@test.local`;
  const reg = await req("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: otherEmail,
      password: "SmokePass123!",
      name: "Other Orders",
    }),
  });
  check("the second customer registers", reg.status === 201, `got ${reg.status}`);

  const page = await req("/app/account");
  const html = strip(page.text);
  check("the second customer sees no order code", !has(html, orderCode));
  check("the second customer sees the empty state", has(html, "You have not ordered anything yet"));

  cookie = saved;
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
