#!/bin/sh
# Install git hooks for this project.

HOOK_DIR="$(cd "$(dirname "$0")/.." && pwd)/.git/hooks"

cp "$(dirname "$0")/pre-commit.sh" "$HOOK_DIR/pre-commit"
chmod +x "$HOOK_DIR/pre-commit"

echo "✓ Git hooks installed."
