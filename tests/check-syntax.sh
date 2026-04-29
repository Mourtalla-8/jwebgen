#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

while IFS= read -r file; do
  node --check "$file" >/dev/null
done < <(rg --files src bin -g '!*.template')

echo "Node syntax check: OK"
