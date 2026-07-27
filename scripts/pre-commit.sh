#!/bin/sh
# Pre-commit hook: rebuild dist/ before every commit
# Run `scripts/install-hooks.sh` to install this hook.

cd "$(git rev-parse --show-toplevel)" || exit 1

echo "→ Rebuilding dist/..."
rm -rf dist && tsc
exit_code=$?

if [ $exit_code -ne 0 ]; then
  echo "✗ Build failed — aborting commit."
  exit 1
fi

git add dist/

echo "✓ dist/ rebuilt and staged."
