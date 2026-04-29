#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node --input-type=module <<'EOF'
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'bin'];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!fullPath.endsWith('.js')) continue;
    if (fullPath.endsWith('.template')) continue;
    files.push(fullPath);
  }
}

for (const root of roots) walk(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
EOF

echo "Node syntax check: OK"
