#!/bin/sh
# Runs only the named test files: `claude plugin test` runs a whole folder, so a copy of the mod holds just those.
#   scripts/test-only.sh band.test.tsx pane.test.tsx
set -eu
[ $# -gt 0 ] || { echo "usage: scripts/test-only.sh <file.test.tsx>..." >&2; exit 2; }
root=$(cd "$(dirname "$0")/.." && pwd)
copy=$(mktemp -d)
trap 'rm -rf "$copy"' EXIT
rsync -a --exclude .git --exclude images --exclude scripts --exclude tests "$root/" "$copy/"
mkdir "$copy/tests"
# The helpers every file may import, then the files asked for.
cp "$root/tests/lang.ts" "$root/tests/world.tsx" "$copy/tests/"
for file in "$@"; do cp "$root/tests/$(basename "$file")" "$copy/tests/"; done
cd "$copy" && claude plugin test .
