#!/bin/bash
while true; do
  echo '=== Thu 29 Jan 2026 22:08:07 PST ==='
  tail -20 ralphy.log
  echo ''
  echo '=== Git Status ==='
  git status --short | head -10
  echo ''
  sleep 30
done
