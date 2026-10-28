#!/usr/bin/env bash
# Probe the admin login redirect behaviour with and without a session.
BASE="${1:-http://localhost:3000}"
JAR="$(mktemp -d)/jar.txt"

echo "=== no session ==="
curl -s -o /dev/null -w "  /app/admin          status=%{http_code} redirect=%{redirect_url}\n" "$BASE/app/admin"
curl -s -o /dev/null -w "  /login              status=%{http_code} redirect=%{redirect_url}\n" "$BASE/login"

echo
echo "=== with session ==="
curl -s -c "$JAR" -o /dev/null -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@freshtrace.com","password":"FreshTrace!2026"}'

curl -s -b "$JAR" -o /dev/null -w "  /app/admin          status=%{http_code} redirect=%{redirect_url}\n" "$BASE/app/admin"
curl -s -b "$JAR" -o /dev/null -w "  /app/admin/login    status=%{http_code} redirect=%{redirect_url}\n" "$BASE/app/admin/login"
