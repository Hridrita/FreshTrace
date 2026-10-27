const fs = require("fs");

function check(label, file, checks) {
  const h = fs.readFileSync(file, "utf8");
  console.log("-- " + label + " (" + file + ")");
  for (const [k, needle] of Object.entries(checks)) {
    console.log((h.includes(needle) ? "PASS" : "FAIL") + "  " + k);
  }
}

check("Orders list", "./orders-page.html", {
  "newest order code shown": "FT-ORD-2026-10-27-0002",
  "older order code shown": "FT-ORD-2026-10-27-0001",
  "status badge rendered": "pending_payment",
  "links to the order detail": "/app/orders/cmvqm37t6000idp50bqiwyjxp",
});

check("Order detail", "./order-detail.html", {
  "order code shown": "FT-ORD-2026-10-27-0002",
  "address snapshot shown": "Gulshan-2",
  "item name shown": "Alphonso Mango",
  "total shown": "500",
});
