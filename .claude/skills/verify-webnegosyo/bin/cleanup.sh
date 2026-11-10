#!/usr/bin/env bash
# verify-webnegosyo Cleanup: undo what a run changed on sample-demo, stop the server THIS skill
# started, keep the evidence.
#
#   .claude/skills/verify-webnegosyo/bin/cleanup.sh [--keep-server] [--no-seed]
#
# 1. restores a temporarily-required qa_* question   (state: $STATE/question.json)
# 2. restores tenant_subscriptions.paid_through        (state: $STATE/hold.json)
# 3. re-runs the idempotent seed: designs, seeded orders, qa_* questions back to optional
# 4. copies the server log into the evidence dir, then kills ONLY the recorded PID's process tree
# Never deletes test-results/verify/<run-id>/.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
BIN="$REPO/.claude/skills/verify-webnegosyo/bin"
PORT=3100
STATE="${VERIFY_STATE_DIR:-${TMPDIR:-/tmp}/verify-webnegosyo-$PORT}"
KEEP_SERVER=0; RUN_SEED=1
for arg in "$@"; do
  [[ "$arg" == "--keep-server" ]] && KEEP_SERVER=1
  [[ "$arg" == "--no-seed" ]] && RUN_SEED=0
done
cd "$REPO"
RUN_ID="$(cat "$STATE/run-id" 2>/dev/null || echo unknown)"
EVIDENCE="$REPO/test-results/verify/$RUN_ID"

node "$BIN/db.mjs" question restore "$STATE/question.json"
node "$BIN/db.mjs" hold restore "$STATE/hold.json"
if (( RUN_SEED )); then
  # The seed keeps scripts/seed/.sample-demo-snapshot.json if present; never let it snapshot seeded values
  # as "pre-seed" (copy the original from the checkout that first seeded, see SKILL.md Gotchas).
  npx tsx scripts/seed/sample-demo-qa.ts >"$STATE/seed-restore.log" 2>&1 \
    && echo "cleanup: seed re-run OK (designs/orders/questions restored)" \
    || { echo "cleanup: SEED RE-RUN FAILED, see $STATE/seed-restore.log"; tail -5 "$STATE/seed-restore.log"; }
fi

if (( ! KEEP_SERVER )); then
  pid="$(cat "$STATE/server.pid" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    [[ -d "$EVIDENCE" ]] && cp "$STATE/server.log" "$EVIDENCE/server-$pid.log" 2>/dev/null
    kids="$(pgrep -P "$pid" || true)"; grandkids=""
    for k in $kids; do grandkids="$grandkids $(pgrep -P "$k" || true)"; done
    kill $grandkids $kids "$pid" 2>/dev/null
    sleep 2
    echo "cleanup: stopped pid $pid (+ children: $kids $grandkids)"
  else
    echo "cleanup: no running server recorded in $STATE"
  fi
  lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && echo "cleanup: WARNING :$PORT still listening" || echo "cleanup: :$PORT free"
  rm -f "$STATE/server.pid" "$STATE/doctor-menu.html"
fi

if [[ -d "$EVIDENCE" ]]; then
  echo "cleanup: evidence kept at $EVIDENCE ($(find "$EVIDENCE" -type f | wc -l | tr -d ' ') files)"
else
  echo "cleanup: no evidence dir for run $RUN_ID"
fi
