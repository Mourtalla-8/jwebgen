import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { runProjectScript } from '../../src/cli/projectRunner.js';

test('runProjectScript prints actionable message on EACCES', async () => {
  if (process.platform === 'win32') {
    // Windows does not reliably enforce POSIX exec bits, making EACCES hard to simulate here.
    return;
  }
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

test('runProjectScript prints cleanup sudo guidance for cleanup-dev marker', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-runner-cleanup-'));
  const scriptsDir = path.join(tmpRoot, '.jwebgen', 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, 'deploy.sh');
  await writeFile(
    scriptPath,
    '#!/usr/bin/env bash\necho "__JWEBGEN_EVENT__ deploy_sudo_required" >&2\nexit 1\n',
    { mode: 0o755 }
  );

  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args.join(' '));

  try {
    await assert.rejects(
      runProjectScript('deploy.sh', ['--cleanup-dev'], {}, {
        findProjectRoot: () => tmpRoot,
        detectLegacyProjectIssues: async () => [],
        canonicalDeployScript: 'deploy.sh',
        legacyDeployScript: 'deploy-tomcat.sh'
      })
    );
    const out = lines.join('\n');
    assert.match(out, /Cleanup failed for target server directories/i);
    assert.match(out, /sudo -v and retry jwebgen --deploy --cleanup-dev/i);
  } finally {
    console.error = originalError;
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('runProjectScript cleanup-dev without sudo marker uses generic failure message', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-runner-cleanup-nomarker-'));
  const scriptsDir = path.join(tmpRoot, '.jwebgen', 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, 'deploy.sh');
  await writeFile(
    scriptPath,
    '#!/usr/bin/env bash\necho "syntax error in deploy" >&2\nexit 1\n',
    { mode: 0o755 }
  );

  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args.join(' '));

  try {
    await assert.rejects(
      runProjectScript('deploy.sh', ['--cleanup-dev'], {}, {
        findProjectRoot: () => tmpRoot,
        detectLegacyProjectIssues: async () => [],
        canonicalDeployScript: 'deploy.sh',
        legacyDeployScript: 'deploy-tomcat.sh'
      })
    );
    const out = lines.join('\n');
    assert.match(out, /deploy\.sh failed:/i);
    assert.doesNotMatch(out, /Cleanup failed for target server directories/i);
    assert.doesNotMatch(out, /sudo -v and retry jwebgen --deploy --cleanup-dev/i);
  } finally {
    console.error = originalError;
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
