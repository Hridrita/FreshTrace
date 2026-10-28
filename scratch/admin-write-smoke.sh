#!/usr/bin/env bash
# Admin write-path smoke check.
#
# Exercises the QC inspection, order fulfilment and refund decision APIs
# against a running dev server, using a real batch and order from the seeded
# database.
#
# Usage: bash scratch/admin-write-smoke.sh [base-url]

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp -d)/cookies.txt"

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILED=1; }
FAILED=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$label ($actual)"; else fail "$label — expected $expected, got $actual"; fi
}

echo "FreshTrace admin & QC panel — write-path smoke check"
echo

# Sign in through the unified login route.
code=$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@freshtrace.com","password":"FreshTrace!2026"}')
check "sign in" "200" "$code"

if [ "$code" != "200" ]; then
  printf '\033[31mCannot continue without a session.\033[0m\n'
  exit 1
fi

echo
echo "1. QC inspection"

# Find an inbound batch to inspect. It is read from the database so the
# check picks a genuinely in-transit batch rather than parsing ids out of
# the rendered markup.
BATCH_ID=$(node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.batch.findFirst({where: {status: 'in_transit'}, orderBy: {createdAt: 'asc'}})
  .then((b) => { console.log(b ? b.id : ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -z "$BATCH_ID" ]; then
  fail "could not find an inbound batch to inspect"
else
  pass "found an inbound batch to inspect"

  # A valid inspection with a good grade.
  resp=$(curl -s -b "$JAR" -X POST "$BASE/api/admin/qc" \
    -H 'Content-Type: application/json' \
    -d "{\"batchId\":\"$BATCH_ID\",\"grade\":\"A\",\"weightKg\":10.5,\"temperatureC\":7,\"notes\":\"Smoke test\",\"photos\":[\"https://example.com/p.jpg\"]}")
  case "$resp" in
    *'"adjustment"'*) pass "the inspection was logged" ;;
    *) fail "the inspection failed — $resp" ;;
  esac

  case "$resp" in
    *'"tier"'*) pass "the freshness tier was recomputed" ;;
    *) fail "no tier in the response" ;;
  esac

  case "$resp" in
    *'"multiplier"'*) pass "the price multiplier was recomputed" ;;
    *) fail "no multiplier in the response" ;;
  esac

  # A grade C must fail the inspection regardless of the payload.
  resp=$(curl -s -b "$JAR" -X POST "$BASE/api/admin/qc" \
    -H 'Content-Type: application/json' \
    -d "{\"batchId\":\"$BATCH_ID\",\"grade\":\"C\",\"weightKg\":10,\"passed\":true}")
  case "$resp" in
    *'"passed":false'*) pass "a grade C fails the inspection" ;;
    *) fail "a grade C did not fail the inspection — $resp" ;;
  esac

  # An invalid grade must be rejected.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/qc" \
    -H 'Content-Type: application/json' \
    -d "{\"batchId\":\"$BATCH_ID\",\"grade\":\"Z\",\"weightKg\":10}")
  check "an invalid grade is rejected" "422" "$code"

  # A non-positive weight must be rejected.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/qc" \
    -H 'Content-Type: application/json' \
    -d "{\"batchId\":\"$BATCH_ID\",\"grade\":\"A\",\"weightKg\":0}")
  check "a zero weight is rejected" "422" "$code"
fi

echo
echo "2. Order fulfilment"

# The order id lives in a client component's props, not in the rendered
# markup, so it is read straight from the database.
ORDER_ID=$(node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.order.findFirst({where: {status: {in: ['paid','in_fulfillment','in_transit']}}, orderBy: {placedAt: 'asc'}})
  .then((o) => { console.log(o ? o.id : ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -z "$ORDER_ID" ]; then
  printf '  \033[33mSKIP\033[0m  no order in a movable state (run scratch/seed-admin-ops.js)\n'
else
  pass "found an order to move"

  # An invalid status must be rejected.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/orders/$ORDER_ID/status" \
    -H 'Content-Type: application/json' -d '{"status":"not_a_status"}')
  check "an invalid status is rejected" "422" "$code"

  # A legal transition must be accepted. The target depends on where the
  # order currently sits, so it is derived rather than hard-coded.
  NEXT_STATUS=$(node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
const map = {
  pending_payment: 'paid',
  paid: 'in_fulfillment',
  in_fulfillment: 'in_transit',
  in_transit: 'delivered',
};
p.order.findUnique({where: {id: '$ORDER_ID'}})
  .then((o) => { console.log(map[o.status] ?? ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

  if [ -n "$NEXT_STATUS" ]; then
    code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/orders/$ORDER_ID/status" \
      -H 'Content-Type: application/json' -d "{\"status\":\"$NEXT_STATUS\"}")
    check "a legal transition ($NEXT_STATUS) is accepted" "200" "$code"

    # Moving it a second time must be refused — the order has moved on.
    code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/orders/$ORDER_ID/status" \
      -H 'Content-Type: application/json' -d "{\"status\":\"$NEXT_STATUS\"}")
    if [ "$code" = "409" ]; then
      pass "repeating the transition is refused ($code)"
    else
      fail "a repeated transition was accepted — got $code"
    fi
  else
    printf '  \033[33mSKIP\033[0m  the order has no further legal transition\n'
  fi
fi

echo
echo "3. Refund decisions"

REFUND_ID=$(node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.refund.findFirst({where: {status: 'requested'}, orderBy: {createdAt: 'asc'}})
  .then((r) => { console.log(r ? r.id : ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -z "$REFUND_ID" ]; then
  printf '  \033[33mSKIP\033[0m  no open refund request to decide (run scratch/seed-admin-ops.js)\n'
else
  pass "found a refund request to decide"

  # A refund cannot jump straight from `requested` to `processed` — the
  # approval is the gate that authorises the money movement.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/refunds/$REFUND_ID" \
    -H 'Content-Type: application/json' -d '{"decision":"processed"}')
  check "processing an unapproved refund is refused" "409" "$code"

  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/refunds/$REFUND_ID" \
    -H 'Content-Type: application/json' -d '{"decision":"approved"}')
  check "the refund is approved" "200" "$code"

  # An approved refund cannot then be rejected.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/refunds/$REFUND_ID" \
    -H 'Content-Type: application/json' -d '{"decision":"rejected"}')
  check "an approved refund cannot be rejected" "409" "$code"

  # It can be processed.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/refunds/$REFUND_ID" \
    -H 'Content-Type: application/json' -d '{"decision":"processed"}')
  check "the approved refund is processed" "200" "$code"

  # A processed refund is final.
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/admin/refunds/$REFUND_ID" \
    -H 'Content-Type: application/json' -d '{"decision":"rejected"}')
  check "a processed refund is final" "409" "$code"
fi

echo
if [ "$FAILED" = "0" ]; then
  printf '\033[32mAll admin write-path checks passed.\033[0m\n'
else
  printf '\033[31mSome admin write-path checks failed.\033[0m\n'
fi
exit "$FAILED"
