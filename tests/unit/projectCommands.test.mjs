import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { runMigrate } from '../../src/cli/projectCommands.js';

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

test('runMigrate does not delete generated deploy-tomcat.sh', async () => {
  const projectRoot = await setupProjectRoot('demoapp3');
  await runMigrate(makeMigrateDeps(projectRoot, 'tomcat'));
  assert.equal(existsSync(path.join(projectRoot, '.jwebgen', 'scripts', 'deploy-tomcat.sh')), true);
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
