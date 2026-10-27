/**
 * Live smoke test for the account page and the account API routes.
 *
 * Signs in over HTTP, then exercises the account page and every write the
 * page depends on, checking both the HTTP responses and the database state.
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
 * Strip React's text separators and HTML entities so plain substring
 * assertions work on server-rendered markup.
 *
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
  return { status: response.status, text, body: safeJson(text) };
}

/**
 * @param {string} text
 */
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const email = `smoke.account.${Date.now()}@test.local`;
const password = "SmokePass123!";

// ─── 1. Register ───────────────────────────────────────────────────────────
console.log("\n1. Register + sign in");
{
  const res = await req("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Smoke Account" }),
  });

  check("register returns 201", res.status === 201, `got ${res.status}`);
  check("register sets a session cookie", cookie.startsWith("ft_session="), cookie);
}

// ─── 2. The account page renders ────────────────────────────────────────────
console.log("\n2. GET /app/account");
let accountHtml = "";
{
  const res = await req("/app/account");
  accountHtml = strip(res.text);

  check("account page returns 200", res.status === 200, `got ${res.status}`);
  check("shows the page heading", has(accountHtml, "Your account"));
  check("shows the details section", has(accountHtml, "Your details"));
  check("shows the name", has(accountHtml, "Smoke Account"));
  check("shows the email", has(accountHtml, email));
  check("shows the addresses section", has(accountHtml, "Delivery addresses"));
  check("shows the subscription section", has(accountHtml, "Your subscription"));
  check("shows the orders section", has(accountHtml, "Recent orders"));
  check("shows the empty subscription state", has(accountHtml, "No subscription yet"));
  check("shows the empty orders state", has(accountHtml, "You have not ordered anything yet"));
  check("links to the orders page", has(accountHtml, 'href="/app/orders"'));
  check("links to the subscriptions page", has(accountHtml, 'href="/app/subscriptions"'));
  check("uses the glass card", has(accountHtml, "backdrop-blur-md"));
}

// ─── 3. Signed-out visitors are redirected ──────────────────────────────────
console.log("\n3. Signed-out /app/account");
{
  const saved = cookie;
  cookie = "";
  const res = await req("/app/account");
  check(
    "redirects to the login page",
    res.status === 307 || res.status === 302 || res.text.includes("login"),
    `status ${res.status}`,
  );
  cookie = saved;
}

// ─── 4. Profile: read and update the name ──────────────────────────────────
console.log("\n4. Profile API");
{
  const read = await req("/api/profile");
  check("GET /api/profile returns 200", read.status === 200, `got ${read.status}`);
  check("profile has the email", read.body?.data?.email === email);
  check("profile hides the password hash", read.body?.data?.passwordHash === undefined);

  const patch = await req("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed Smoke" }),
  });
  check("PATCH /api/profile returns 200", patch.status === 200, `got ${patch.status}`);
  check("name is updated", patch.body?.data?.name === "Renamed Smoke");
  check("email is unchanged", patch.body?.data?.email === email);

  // The email cannot be changed through the profile route.
  const hijack = await req("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed Smoke", email: "hijack@example.com" }),
  });
  check("email cannot be hijacked", hijack.body?.data?.email === email);
}

// ─── 5. Addresses: add, list, edit, default, delete ────────────────────────
console.log("\n5. Address API");
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

  check("POST /api/addresses returns 201", create.status === 201, `got ${create.status}`);
  addressId = create.body?.data?.id ?? "";
  check("the new address is the default", create.body?.data?.isDefault === true);

  // The account page now lists the address.
  const page = await req("/app/account");
  const html = strip(page.text);
  check("the account page lists the address", has(html, "House 10, Road 5"));
  check("the account page shows the area", has(html, "Gulshan-2"));

  // Edit it.
  const update = await req(`/api/addresses/${addressId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Office",
      line1: "Flat 4B, Banani",
      line2: "Floor 4",
      area: "Banani",
      city: "Dhaka",
      deliveryNotes: "Ring the bell",
    }),
  });
  check("PATCH /api/addresses returns 200", update.status === 200, `got ${update.status}`);
  check("the label is updated", update.body?.data?.label === "Office");
  check("the line1 is updated", update.body?.data?.line1 === "Flat 4B, Banani");
  check("the notes are saved", update.body?.data?.deliveryNotes === "Ring the bell");
  check("the default flag survives an edit", update.body?.data?.isDefault === true);

  // Clear an emptied optional field.
  const clear = await req(`/api/addresses/${addressId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Office",
      line1: "Flat 4B, Banani",
      line2: "",
      area: "Banani",
      city: "Dhaka",
      deliveryNotes: "",
    }),
  });
  check("an emptied optional field is cleared", clear.body?.data?.line2 === null, JSON.stringify(clear.body?.data));
  check("the cleared notes are null", clear.body?.data?.deliveryNotes === null);

  // A second address, then move the default.
  const second = await req("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Office",
      line1: "Flat 9C, Banani",
      area: "Banani",
      city: "Dhaka",
    }),
  });
  const secondId = second.body?.data?.id ?? "";
  check("the second address is not the default", second.body?.data?.isDefault === false);

  const makeDefault = await req(`/api/addresses/${secondId}`, { method: "POST" });
  check("POST /api/addresses/:id sets the default", makeDefault.status === 200, `got ${makeDefault.status}`);
  check("the new default is set", makeDefault.body?.data?.isDefault === true);

  // Delete the second address again.
  const remove = await req(`/api/addresses/${secondId}`, { method: "DELETE" });
  check("DELETE /api/addresses/:id returns 200", remove.status === 200, `got ${remove.status}`);

  const list = await req("/api/addresses");
  check("one address is left", list.body?.data?.length === 1, JSON.stringify(list.body?.data?.length));
  check("the oldest address is the default again", list.body?.data?.[0]?.id === addressId);
}

// ─── 6. A protected address cannot be deleted ───────────────────────────────
console.log("\n6. Address protection for a live subscription");
{
  // Subscribe using the saved address.
  const plans = await req("/api/subscriptions/plans");
  const planId = plans.body?.data?.[0]?.id ?? "";
  check("there is a plan to subscribe to", Boolean(planId));

  const sub = await req("/api/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, addressId, dayOfWeek: 5 }),
  });
  check("POST /api/subscriptions returns 201", sub.status === 201, `got ${sub.status}`);
  const subscriptionId = sub.body?.data?.id ?? "";

  const remove = await req(`/api/addresses/${addressId}`, { method: "DELETE" });
  check("the delete is rejected with 409", remove.status === 409, `got ${remove.status}`);
  check("the error code is conflict", remove.body?.error?.code === "conflict");
  check(
    "the error names the blocking subscription",
    Array.isArray(remove.body?.error?.details?.subscriptionIds) &&
      remove.body.error.details.subscriptionIds.includes(subscriptionId),
    JSON.stringify(remove.body?.error?.details),
  );

  // The account page now shows the subscription overview.
  const page = await req("/app/account");
  const html = strip(page.text);
  check("the account page shows the subscription", has(html, "Next delivery"));
  check("the account page shows the delivery day", has(html, "Every Friday"));
  check("the account page shows where it delivers", has(html, "Delivering to"));
  check("the account page shows the basket items", has(html, "Items in your weekly basket"));
  check("the account page shows the manage link", has(html, "Manage subscription"));
  check("the account page shows the active badge", has(html, "Active"));

  // Cancel the subscription, then the address is free again.
  const cancel = await req(`/api/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
  check("the subscription cancels", cancel.status === 200, `got ${cancel.status}`);

  const removeAfter = await req(`/api/addresses/${addressId}`, { method: "DELETE" });
  check("the address deletes once the subscription ends", removeAfter.status === 200, `got ${removeAfter.status}`);
}

// ─── 7. The product page's subscription button ──────────────────────────────
console.log("\n7. Product page subscription button");
{
  const products = await req("/api/products");
  const sku = products.body?.data?.[0]?.sku ?? "";
  check("there is a product to open", Boolean(sku));

  // The subscription was cancelled in step 6, so the customer has no plan
  // and the button offers to start one.
  const page = await req(`/app/products/${sku}`);
  const html = strip(page.text);
  check("the product page returns 200", page.status === 200, `got ${page.status}`);
  check(
    "without a plan it says 'Start a weekly subscription'",
    has(html, "Start a weekly subscription"),
  );
  check("the button links to the subscriptions page", has(html, 'href="/app/subscriptions"'));
}

// ─── 8. The subscriptions page offers the inline address form ───────────────
console.log("\n8. Subscription setup page");
{
  // The address was deleted in step 6, so the customer has none and the
  // inline form is open by default.
  const page = await req("/app/subscriptions");
  const html = strip(page.text);
  check("the subscriptions page returns 200", page.status === 200, `got ${page.status}`);
  check("it offers the inline address form", has(html, "Where should we deliver?"));
  check(
    "it explains that an address is needed",
    has(html, "You need a saved delivery address before you can subscribe"),
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
console.log(`Account: ${email}`);

if (failed > 0) process.exitCode = 1;
