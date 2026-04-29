import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { detectServerTargetFromProject, parseCliOptions } from '../../src/cli/projectCliUtils.js';

test('parseCliOptions keeps unknown args and toggles verbose', () => {
  const parsed = parseCliOptions(['-v', '--flag', 'value', '--verbose']);
  assert.equal(parsed.verbose, true);
  assert.deepEqual(parsed.scriptArgs, ['--flag', 'value']);
});

test('detectServerTargetFromProject defaults to tomcat without dev script', () => {
  const target = detectServerTargetFromProject('/tmp/does-not-exist-jwebgen');
  assert.equal(target, 'tomcat');
});

test('detectServerTargetFromProject reads wildfly export from scripts/dev.sh', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-cliutils-'));
  try {
    const scriptsDir = path.join(tmpRoot, 'scripts');
    await mkdir(scriptsDir, { recursive: true });
    await writeFile(path.join(scriptsDir, 'dev.sh'), 'export JWEBGEN_SERVER_TARGET="wildfly"\n', 'utf8');
    const target = detectServerTargetFromProject(tmpRoot);
    assert.equal(target, 'wildfly');
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
