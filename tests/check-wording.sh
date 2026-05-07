#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATTERN='(?i)\bdivision\s+[a-z]\b|\bcursor\b|\bagent\b|\bco-authored-by\b|made with'

if rg -n --no-heading --color never -i "$PATTERN" -g '!tests/check-wording.sh' \
  README.md CHANGELOG.md CONTRIBUTING.md TROUBLESHOOTING.md \
  src tests .github docs; then
  echo
  echo "Forbidden wording detected. Please remove blocked terms from project-facing text."
  exit 1
fi

echo "Wording check: OK"
