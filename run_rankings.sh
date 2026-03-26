#!/usr/bin/env bash
set -euo pipefail

echo "ARGV OK"
if [ -d /repo/apps/crawler ]; then
  cd /repo/apps/crawler
elif [ -d /app/apps/crawler ]; then
  cd /app/apps/crawler
else
  echo "crawler dir not found"
  echo "ls /"; ls -la /
  echo "ls /app"; ls -la /app || true
  echo "ls /repo"; ls -la /repo || true
  exit 1
fi

echo "PWD=$(pwd)"
ls -la
pnpm run oliveyoung:rankings -- --limit="${LIMIT:-100}"