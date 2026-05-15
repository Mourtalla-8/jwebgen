import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const unitDir = join(dirname(here), 'unit');
const files = readdirSync(unitDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(unitDir, name));

if (files.length === 0) {
  console.error(`run-unit: no *.test.mjs files found in ${unitDir}`);
  process.exit(1);
}

// One Node process per test file so process.env, console, cwd, and test-runner
// defaults cannot leak across files (hosted macOS/Windows runners are sensitive).
for (const file of files) {
  const result = spawnSync(process.execPath, ['--test', file], {
    stdio: 'inherit',
    shell: false
  });
  const code = result.status;
  if (code !== 0) {
    process.exit(code === null ? 1 : code);
  }
}

process.exit(0);
