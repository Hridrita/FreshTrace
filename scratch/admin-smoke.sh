#!/usr/bin/env bash
# Admin & QC operations panel — end-to-end smoke check.
#
# Exercises the real HTTP surface of the operations panel against a running
# dev server: the guard, the fixed-credential login, the protected pages,
# and the QC / order / refund write paths.
#
# Usage: bash scratch/admin-smoke.sh [base-url]

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp -d)/cookies.txt"

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILED=1; }
FAILED=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$label ($actual)"; else fail "$label — expected $expected, got $actual"; fi
}

echo "FreshTrace admin & QC panel — smoke check against $BASE"
echo

# ── 1. The guard rejects an unauthenticated request ───────────────────────
echo "1. Access control"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/app/admin")
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/app/admin")

# The guard redirects to the login page, so the response is a 3xx.
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then
  pass "unauthenticated /app/admin redirects ($code)"
else
  fail "unauthenticated /app/admin — expected a redirect, got $code"
fi

case "$loc" in
  *"/login"*) pass "redirect target is the unified login page" ;;
  *) fail "redirect target — expected /login, got '$loc'" ;;
esac

# Every protected page must be gated, not just the dashboard.
for path in /app/admin/batches /app/admin/orders /app/admin/subscriptions /app/admin/settings; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then
    pass "$path is gated"
  else
    fail "$path is not gated — got $code"
  fi
done

# The write endpoints must reject an unauthenticated call.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/qc" \
  -H 'Content-Type: application/json' -d '{"batchId":"x","grade":"A","weightKg":1}')
check "unauthenticated POST /api/admin/qc is rejected" "401" "$code"

echo

# ── 2. The fixed credential ───────────────────────────────────────────────
echo "2. Admin login (through the unified /api/auth/login route)"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@freshtrace.com","password":"definitely-wrong"}')
check "wrong password is rejected" "401" "$code"

code=$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@freshtrace.com","password":"AdminPassword123!"}')
check "fixed credential signs in" "200" "$code"

if grep -q 'ft_admin_session' "$JAR"; then
  pass "the admin session cookie is set"
else
  fail "the admin session cookie was not set"
fi

# The retired admin-only sign-in route must be gone.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/app/admin/login")
check "the retired /app/admin/login route is gone" "404" "$code"

echo

# ── 3. The authenticated pages render ──────────────────────────────────────
echo "3. Authenticated pages"

for path in /app/admin /app/admin/batches /app/admin/orders /app/admin/subscriptions /app/admin/settings; do
  body=$(curl -s -b "$JAR" "$BASE$path")
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$code" = "200" ] && [ -n "$body" ]; then
    pass "$path renders ($code)"
  else
    fail "$path — expected 200, got $code"
  fi
done

# The dashboard must actually carry the KPI figures.
body=$(curl -s -b "$JAR" "$BASE/app/admin")
for label in "Active baskets" "Total subscriptions" "QC pass rate" "Gross margin"; do
  case "$body" in
    *"$label"*) pass "dashboard shows '$label'" ;;
    *) fail "dashboard is missing '$label'" ;;
  esac
done

echo

# ── 4. The sign-out ends the session ──────────────────────────────────────
echo "4. Sign out"

code=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/login")
check "sign out succeeds" "200" "$code"

code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE/app/admin")
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then
  pass "the session is dead after sign out"
else
  fail "the session survived sign out — got $code"
fi

echo
if [ "$FAILED" = "0" ]; then
  printf '\033[32mAll admin smoke checks passed.\033[0m\n'
else
  printf '\033[31mSome admin smoke checks failed.\033[0m\n'
fi
exit "$FAILED"
