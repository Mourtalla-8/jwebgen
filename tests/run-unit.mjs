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

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status === null ? 1 : result.status);
