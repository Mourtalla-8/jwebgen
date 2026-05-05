import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import {
  hintTomcatWhenStoppedForStatus,
  hintWildflyWhenStoppedForStatus,
  resolveStatusHttpPort,
  runMigrate,
  serverRunningFromPgrepResult
} from '../../src/cli/projectCommands.js';

test('serverRunningFromPgrepResult maps pgrep exit codes', () => {
  assert.equal(serverRunningFromPgrepResult({ exitCode: 0, stderr: '' }), true);
  assert.equal(serverRunningFromPgrepResult({ exitCode: 1, stderr: '' }), false);
  assert.equal(serverRunningFromPgrepResult({ exitCode: 2, stderr: '' }), null);
  assert.equal(serverRunningFromPgrepResult({ exitCode: 2, stderr: 'no pgrep' }), null);
});

test('hintTomcatWhenStoppedForStatus skips systemctl wording on Windows and macOS', () => {
  assert.match(hintTomcatWhenStoppedForStatus('win32'), /startup/i);
  assert.match(hintTomcatWhenStoppedForStatus('darwin'), /macOS/);
  assert.ok(!hintTomcatWhenStoppedForStatus('win32').includes('systemctl'));
  assert.match(hintTomcatWhenStoppedForStatus('linux'), /systemctl/);
});

test('hintWildflyWhenStoppedForStatus is OS-specific', () => {
  assert.match(hintWildflyWhenStoppedForStatus('win32'), /standalone\.bat/i);
  assert.match(hintWildflyWhenStoppedForStatus('darwin'), /standalone\.sh/);
});

test('resolveStatusHttpPort prefers env over config then 8080', () => {
  const prev = process.env.JWEBGEN_HTTP_PORT;
  try {
    process.env.JWEBGEN_HTTP_PORT = '9090';
    assert.equal(resolveStatusHttpPort({ JWEBGEN_HTTP_PORT: '8081' }), '9090');
    delete process.env.JWEBGEN_HTTP_PORT;
    assert.equal(resolveStatusHttpPort({ JWEBGEN_HTTP_PORT: '8081' }), '8081');
    assert.equal(resolveStatusHttpPort({}), '8080');
  } finally {
    if (prev === undefined) delete process.env.JWEBGEN_HTTP_PORT;
    else process.env.JWEBGEN_HTTP_PORT = prev;
  }
});

async function setupProjectRoot(name = 'appx') {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-migrate-'));
  const projectRoot = path.join(tmpRoot, name);
  const scriptsDir = path.join(projectRoot, '.jwebgen', 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(path.join(projectRoot, 'src', 'main', 'java'), { recursive: true });
  await writeFile(path.join(projectRoot, 'pom.xml'), '<project/>', 'utf8');
  return projectRoot;
}

function makeMigrateDeps(projectRoot, detectedTarget = 'tomcat') {
  return {
    findProjectRoot: () => projectRoot,
    detectServerTargetFromProject: () => detectedTarget,
    writeFileSafe: async (p, c) => {
      await mkdir(path.dirname(p), { recursive: true }).catch(() => {});
      await writeFile(p, c, 'utf8');
    },
    makeBuildScript: () => '#!/usr/bin/env bash\n',
    makeDeployServerScript: () => '#!/usr/bin/env bash\n',
    makeDeploySelectorScript: () => '#!/usr/bin/env bash\n',
    makeDevScript: () => '#!/usr/bin/env bash\n',
    makeWatchScript: () => '#!/usr/bin/env bash\n',
    makeAddServletScript: () => '#!/usr/bin/env bash\n',
    makeLiveReloadClientScript: () => 'console.log(\"lr\")\n',
    makeExecutable: async () => {},
    legacyDeployScript: 'deploy-tomcat.sh'
  };
}

test('runMigrate preserves existing server target and extra .jwebgenrc keys', async () => {
  const projectRoot = await setupProjectRoot('demoapp');
  await writeFile(
    path.join(projectRoot, '.jwebgen', '.jwebgenrc'),
    'export JWEBGEN_SERVER_TARGET="wildfly"\nexport JWEBGEN_HTTP_PORT="8089"\n',
    'utf8'
  );

  await runMigrate(makeMigrateDeps(projectRoot, 'tomcat'));

  const cfg = await readFile(path.join(projectRoot, '.jwebgen', '.jwebgenrc'), 'utf8');
  assert.match(cfg, /export JWEBGEN_SERVER_TARGET="wildfly"/);
  assert.match(cfg, /export JWEBGEN_HTTP_PORT="8089"/);
});

test('runMigrate writes detected target when .jwebgenrc is missing', async () => {
  const projectRoot = await setupProjectRoot('demoapp2');

  await runMigrate(makeMigrateDeps(projectRoot, 'wildfly'));

  const cfg = await readFile(path.join(projectRoot, '.jwebgen', '.jwebgenrc'), 'utf8');
  assert.match(cfg, /export JWEBGEN_SERVER_TARGET="wildfly"/);
});

test('runMigrate keeps server unset when no target is explicitly configured', async () => {
  const projectRoot = await setupProjectRoot('demoapp-unset');
  await writeFile(
    path.join(projectRoot, '.jwebgen', 'scripts', 'dev.sh'),
    '#!/usr/bin/env bash\necho dev\n',
    'utf8'
  );

  await runMigrate(makeMigrateDeps(projectRoot, 'tomcat'));

  const cfgPath = path.join(projectRoot, '.jwebgen', '.jwebgenrc');
  assert.equal(existsSync(cfgPath), false);
});

test('runMigrate does not delete generated deploy-tomcat.sh', async () => {
  const projectRoot = await setupProjectRoot('demoapp3');
  await runMigrate(makeMigrateDeps(projectRoot, 'tomcat'));
  assert.equal(existsSync(path.join(projectRoot, '.jwebgen', 'scripts', 'deploy-tomcat.sh')), true);
});

test('runMigrate skips DevLiveReloadFilter.java outside legacy path without jwebgen live-reload marker', async () => {
  const projectRoot = await setupProjectRoot('legacy-keep-other');
  const otherDir = path.join(projectRoot, 'src', 'main', 'java', 'com', 'corp', 'stuff');
  await mkdir(otherDir, { recursive: true });
  const otherFile = path.join(otherDir, 'DevLiveReloadFilter.java');
  await writeFile(otherFile, 'package com.corp.stuff;\npublic class DevLiveReloadFilter {}\n', 'utf8');

  await runMigrate({
    ...makeMigrateDeps(projectRoot, 'tomcat'),
    makeNodeBuildScript: () => '#!/usr/bin/env node\n',
    makeNodeDeployScript: () => '#!/usr/bin/env node\n',
    makeNodeDevScript: () => '#!/usr/bin/env node\n',
    makeNodeWatchScript: () => '#!/usr/bin/env node\n'
  });

  assert.equal(existsSync(otherFile), true);
});

test('runMigrate removes legacy DevLiveReloadFilter and webapp/.jwebgen/live-reload.js', async () => {
  const projectRoot = await setupProjectRoot('legacy-clean');
  const filterDir = path.join(projectRoot, 'src', 'main', 'java', 'com', 'exo', 'dev');
  await mkdir(filterDir, { recursive: true });
  await writeFile(path.join(filterDir, 'DevLiveReloadFilter.java'), '// legacy filter\n', 'utf8');
  const webLegacyDir = path.join(projectRoot, 'src', 'main', 'webapp', '.jwebgen');
  await mkdir(webLegacyDir, { recursive: true });
  await writeFile(path.join(webLegacyDir, 'live-reload.js'), '// lr\n', 'utf8');

  await runMigrate({
    ...makeMigrateDeps(projectRoot, 'tomcat'),
    makeNodeBuildScript: () => '#!/usr/bin/env node\n',
    makeNodeDeployScript: () => '#!/usr/bin/env node\n',
    makeNodeDevScript: () => '#!/usr/bin/env node\n',
    makeNodeWatchScript: () => '#!/usr/bin/env node\n'
  });

  assert.equal(existsSync(path.join(filterDir, 'DevLiveReloadFilter.java')), false);
  assert.equal(existsSync(webLegacyDir), false);
});

test('runMigrate deletes only dedicated legacy deploy script', async () => {
  const projectRoot = await setupProjectRoot('demoapp4');
  const legacyName = 'deploy-legacy.sh';
  await writeFile(path.join(projectRoot, '.jwebgen', 'scripts', legacyName), '#!/usr/bin/env bash\necho old\n', 'utf8');

  await runMigrate({
    ...makeMigrateDeps(projectRoot, 'tomcat'),
    legacyDeployScript: legacyName
  });

  assert.equal(existsSync(path.join(projectRoot, '.jwebgen', 'scripts', legacyName)), false);
  assert.equal(existsSync(path.join(projectRoot, '.jwebgen', 'scripts', 'deploy-tomcat.sh')), true);
});
