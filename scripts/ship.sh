#!/bin/sh
# Ship WordProcurement: typecheck, commit, push to main, trigger Dailey deploy.
#
# Usage:
#   scripts/ship.sh "commit message"
#
# Assumes `dailey` CLI is on PATH and already authenticated
# (`dailey whoami` should work).

set -e

cd "$(dirname "$0")/.."

if [ -z "$1" ]; then
  echo "usage: $0 \"<commit message>\"" >&2
  exit 1
fi
MSG="$1"

echo "==> Typecheck"
npx tsc --noEmit

echo "==> Git status"
git status --short

# Commit only if there's something to commit.
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo "==> Committing"
  git add -A
  git commit -m "$MSG"
else
  echo "==> Working tree clean, skipping commit"
fi

echo "==> Pushing to origin/main"
git push origin main

echo "==> Triggering Dailey deploy"
dailey deploy word-procurement

echo
echo "Deploy kicked off. Watch progress with:"
echo "  dailey deploys word-procurement"
echo "  dailey logs word-procurement"
