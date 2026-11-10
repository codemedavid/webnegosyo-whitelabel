#!/usr/bin/env bash
# verify-webnegosyo Doctor: read-only "is this instance worth driving?"
#
#   .claude/skills/verify-webnegosyo/bin/doctor.sh [--tenant <slug>]
#
# Checks, each printed PASS/FAIL/WARN:
#   1. tenant guard      only sample-demo may be driven (any other --tenant / VERIFY_TENANT is refused)
#   2. server            :3100 is listening AND the listener descends from the PID launch.sh recorded
#   3. right worktree    the listener's cwd is this repo
#   4. host routing      sample-demo.localhost:3100/menu is 200 and names "Sample Demo" (PLATFORM_ROOT_DOMAIN=localhost:3100)
#   5. tenant            sample-demo resolves to one platform-backend tenant (service role)
#   6. seed              4 QA menu items, 5 qa_* questions, 3 QA vouchers, 3 Page Designer designs enabled
#   7. admin session     magic-link session reaches /admin/orders (not /login, not "on hold")
#   8. subscription      paid_through (WARN when overdue: admin pages park on "on hold" until `db.mjs hold lift`)
# Exit 0 only when every FAIL-level check passes. Writes nothing.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
BIN="$REPO/.claude/skills/verify-webnegosyo/bin"
PORT=3100
STATE="${VERIFY_STATE_DIR:-${TMPDIR:-/tmp}/verify-webnegosyo-$PORT}"
TENANT="${VERIFY_TENANT:-sample-demo}"
[[ "${1:-}" == "--tenant" ]] && TENANT="${2:-}"
cd "$REPO"
fails=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }
warn() { echo "WARN  $1"; }

descends_from() {
  local pid="$1" root="$2"
  while [[ -n "$pid" && "$pid" != "1" && "$pid" != "0" ]]; do
    [[ "$pid" == "$root" ]] && return 0
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
  return 1
}

# 1. tenant guard
if [[ "$TENANT" != "sample-demo" ]]; then
  echo "FAIL  tenant guard: '$TENANT' is not the designated test store. verify-webnegosyo drives sample-demo ONLY."
  exit 3
fi
pass "tenant guard: sample-demo"

# 2. server up and ours
owner="$(lsof -nP -t -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -1)"
ours="$(cat "$STATE/server.pid" 2>/dev/null || true)"
if [[ -z "$owner" ]]; then
  fail "server: nothing listening on :$PORT (run bin/launch.sh)"
elif [[ -n "$ours" ]] && descends_from "$owner" "$ours"; then
  pass "server: :$PORT pid $owner (started by launch.sh as $ours)"
else
  fail "server: :$PORT is pid $owner, not started by this skill (state $STATE) — do not drive it"
fi

# 3. right worktree
if [[ -n "$owner" ]]; then
  cwd="$(lsof -a -p "$owner" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  [[ "$cwd" == "$REPO" ]] && pass "worktree: $cwd" || fail "worktree: listener cwd is '$cwd', expected $REPO"
fi

# 4. host routing
code="$(curl -s -o "$STATE/doctor-menu.html" -w '%{http_code}' -m 240 http://sample-demo.localhost:$PORT/menu)"
if [[ "$code" == "200" ]] && grep -q "Sample Demo" "$STATE/doctor-menu.html"; then
  pass "routing: sample-demo.localhost:$PORT/menu 200, names Sample Demo"
else
  fail "routing: sample-demo.localhost:$PORT/menu → $code (is PLATFORM_ROOT_DOMAIN=localhost:$PORT?)"
fi

# 5 + 6. tenant and seed (service-role reads, sample-demo only)
seed="$(node "$BIN/db.mjs" read menu_items 'select=name&name=like.QA*' 2>&1)" || seed="ERR $seed"
items="$(grep -c '"name": "QA ' <<<"$seed")"
qs="$(node "$BIN/db.mjs" read customer_form_fields 'select=field_name,is_required&field_name=like.qa_*' 2>&1)"
qcount="$(grep -c '"field_name": "qa_' <<<"$qs")"
qreq="$(grep -c '"is_required": true' <<<"$qs")"
vs="$(node "$BIN/db.mjs" read vouchers 'select=code&code=like.QA*' 2>&1)"
vcount="$(grep -c '"code": "QA' <<<"$vs")"
designs="$(node "$BIN/db.mjs" read tenants 'select=checkout_design_enabled,confirmation_design_enabled,tracking_design_enabled' 2>&1)"
dcount="$(grep -c 'true' <<<"$designs")"
if [[ "$items" -ge 4 && "$qcount" -eq 5 && "$vcount" -eq 3 && "$dcount" -eq 3 ]]; then
  pass "seed: $items QA items, $qcount qa_* questions, $vcount QA vouchers, $dcount/3 designs enabled"
else
  fail "seed: items=$items questions=$qcount vouchers=$vcount designs=$dcount/3 (run: npx tsx scripts/seed/sample-demo-qa.ts)"
fi
[[ "$qreq" -eq 0 ]] && pass "seed: every qa_* question optional (baseline)" || warn "seed: $qreq qa_* question(s) REQUIRED — a previous run did not restore (bin/db.mjs question restore $STATE/question.json, or re-run the seed)"

# 8. subscription (before 7: an overdue store parks admin pages)
paid="$(node "$BIN/db.mjs" read tenant_subscriptions 'select=paid_through' 2>/dev/null | sed -n 's/.*"paid_through": "\(.*\)".*/\1/p')"
today="$(date +%Y-%m-%d)"
if [[ -n "$paid" && "$paid" < "$today" ]]; then
  warn "subscription: paid_through $paid is overdue → admin shows 'on hold'. Lift with: node $BIN/db.mjs hold lift $STATE/hold.json (cleanup restores)"
else
  pass "subscription: paid_through ${paid:-none}"
fi
[[ -f "$STATE/hold.json" ]] && warn "subscription: a lifted hold is pending restore ($STATE/hold.json → $(cat "$STATE/hold.json"))"

# 7. admin session
admin="$(npx tsx "$BIN/admin-check.ts" /admin/orders 2>&1 | tail -1)"
case "$admin" in
  *'"verdict":"ok"'*) pass "admin session: $admin" ;;
  *'"verdict":"on-hold"'*) warn "admin session valid but store is on hold: $admin" ;;
  *) fail "admin session: $admin" ;;
esac

echo "---"
if (( fails )); then echo "DOCTOR: $fails check(s) FAILED — do not drive"; exit 1; fi
echo "DOCTOR: OK — worth driving"
