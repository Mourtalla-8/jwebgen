import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { runProjectScript } from '../../src/cli/projectRunner.js';

test('runProjectScript prints actionable message on EACCES', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-runner-eacces-'));
  const scriptsDir = path.join(tmpRoot, '.jwebgen', 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, 'add-servlet.sh');
  await writeFile(scriptPath, '#!/usr/bin/env bash\necho ok\n', 'utf8');

  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args.join(' '));

  try {
    await assert.rejects(
      runProjectScript('add-servlet.sh', ['HelloServlet'], {}, {
        findProjectRoot: () => tmpRoot,
        detectLegacyProjectIssues: async () => [],
        canonicalDeployScript: 'deploy.sh',
        legacyDeployScript: 'deploy-tomcat.sh'
      })
    );
    assert.match(lines.join('\n'), /permission denied/i);
    assert.match(lines.join('\n'), /chmod \+x/i);
    assert.match(lines.join('\n'), /jwebgen --migrate/);
  } finally {
    console.error = originalError;
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
