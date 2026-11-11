#!/usr/bin/env bash
# verify-webnegosyo Launch: start ONE dev server on port 3100 for this worktree and wait until
# the sample-demo storefront answers. Writes the PID + log under the run's state dir.
#
#   .claude/skills/verify-webnegosyo/bin/launch.sh            # prints RUN_ID / EVIDENCE / STATE
#
# Ready = GET http://sample-demo.localhost:3100/menu returns 200 AND the HTML names "Sample Demo"
# (first compile under webpack takes 1-4 minutes).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT=3100
STATE="${VERIFY_STATE_DIR:-${TMPDIR:-/tmp}/verify-webnegosyo-$PORT}"
RUN_ID="${VERIFY_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
EVIDENCE="$REPO/test-results/verify/$RUN_ID"
mkdir -p "$STATE" "$EVIDENCE"

# True when pid $1 is $2 or one of its descendants (npx -> next dev -> next-server).
descends_from() {
  local pid="$1" root="$2"
  while [[ -n "$pid" && "$pid" != "1" && "$pid" != "0" ]]; do
    [[ "$pid" == "$root" ]] && return 0
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
  return 1
}

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  owner="$(lsof -nP -t -iTCP:$PORT -sTCP:LISTEN | head -1)"
  ours="$(cat "$STATE/server.pid" 2>/dev/null || true)"
  if [[ -n "$ours" ]] && descends_from "$owner" "$ours"; then
    echo "launch: a server this skill started is already on :$PORT (pid $ours); reusing it"
  else
    echo "launch: REFUSING - port $PORT is held by pid $owner, which this skill did not start. Do not drive it." >&2
    exit 2
  fi
else
  cd "$REPO"
  # webpack, not Turbopack: Turbopack refuses the symlinked node_modules of a worktree.
  PLATFORM_ROOT_DOMAIN=localhost:$PORT nohup npx next dev -p $PORT >"$STATE/server.log" 2>&1 &
  echo $! >"$STATE/server.pid"
  echo "launch: started next dev (pid $(cat "$STATE/server.pid")), log $STATE/server.log"
fi

echo "$RUN_ID" >"$STATE/run-id"
deadline=$((SECONDS + 420))
until body="$(curl -s -m 240 http://sample-demo.localhost:$PORT/menu)" && grep -q "Sample Demo" <<<"$body"; do
  if (( SECONDS > deadline )); then
    echo "launch: NOT READY after 7 min; tail of log:" >&2
    tail -30 "$STATE/server.log" >&2 || true
    exit 1
  fi
  sleep 5
done
echo "launch: READY http://sample-demo.localhost:$PORT/menu"
echo "RUN_ID=$RUN_ID"
echo "EVIDENCE=$EVIDENCE"
echo "STATE=$STATE"
