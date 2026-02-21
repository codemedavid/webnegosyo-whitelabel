#!/bin/bash
# Take a screenshot from the booted iOS simulator
# Usage: ./scripts/take-screenshot.sh <name>
# Example: ./scripts/take-screenshot.sh 01_home

NAME=${1:-screenshot}
DEVICE=$(xcrun simctl list devices booted -j | python3 -c "import json,sys; devices=json.load(sys.stdin)['devices']; print(next(d['udid'] for r in devices.values() for d in r if d['state']=='Booted'))" 2>/dev/null)

if [ -z "$DEVICE" ]; then
  echo "No booted simulator found"
  exit 1
fi

OUTPUT="assets/screenshots/iphone/raw_${NAME}.png"
mkdir -p assets/screenshots/iphone

xcrun simctl io "$DEVICE" screenshot "$OUTPUT"
echo "Saved: $OUTPUT"
