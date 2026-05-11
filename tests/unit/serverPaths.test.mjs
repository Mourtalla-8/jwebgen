import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inferWildflyHomeFromDeployments,
  LINUX_DEFAULT_TOMCAT_HOME,
  LINUX_DEFAULT_WILDFLY_HOME,
  looksLikeApacheTomcatHome,
  probeApacheTomcatHome,
  resolveTomcatHome,
  resolveWildflyPaths,
  validateWildflyDeploymentsPath
} from '../../src/project/serverPaths.js';

test('resolveTomcatHome respects env, config and Linux fallback', () => {
  assert.equal(resolveTomcatHome({ env: { TOMCAT_HOME: '/srv/tomcat' }, cfg: {}, platform: 'linux' }), '/srv/tomcat');
  assert.equal(resolveTomcatHome({ env: {}, cfg: { TOMCAT10: '/opt/tomcat10' }, platform: 'linux' }), '/opt/tomcat10');
  assert.equal(resolveTomcatHome({ env: {}, cfg: {}, platform: 'linux' }), LINUX_DEFAULT_TOMCAT_HOME);
  assert.equal(resolveTomcatHome({ env: {}, cfg: {}, platform: 'darwin' }), '');
});

test('resolveWildflyPaths builds deployments path from selected home', () => {
  const resolved = resolveWildflyPaths({ env: {}, cfg: {}, platform: 'linux' });
  assert.equal(resolved.wildflyHome, LINUX_DEFAULT_WILDFLY_HOME);
  assert.equal(resolved.deployments, path.join(LINUX_DEFAULT_WILDFLY_HOME, 'standalone', 'deployments'));
});

test('resolveWildflyPaths infers WILDFLY_HOME when only deployments env is set', () => {
  const dep = '/opt/wf/standalone/deployments';
  const resolved = resolveWildflyPaths({
    env: { WILDFLY_DEPLOYMENTS: dep },
    cfg: {},
    platform: 'linux'
  });
  assert.equal(resolved.deployments, dep);
  assert.equal(resolved.wildflyHome, inferWildflyHomeFromDeployments(dep));
});

test('inferWildflyHomeFromDeployments returns empty for unrelated paths', () => {
  assert.equal(inferWildflyHomeFromDeployments('/var/tmp'), '');
  const dep = path.join(path.sep, 'x', 'y', 'standalone', 'deployments');
  assert.equal(inferWildflyHomeFromDeployments(dep), path.join(path.sep, 'x', 'y'));
});

test('looksLikeApacheTomcatHome rejects webapps-only directory trees', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jwebgen-tcat-'));
  try {
    mkdirSync(path.join(tmp, 'webapps'), { recursive: true });
    assert.equal(looksLikeApacheTomcatHome(tmp, 'linux'), false);

    mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    mkdirSync(path.join(tmp, 'bin'), { recursive: true });
    writeFileSync(path.join(tmp, 'lib', 'catalina.jar'), '');
    writeFileSync(path.join(tmp, 'bin', 'bootstrap.jar'), '');
    writeFileSync(path.join(tmp, 'bin', 'catalina.sh'), '#!/bin/sh\n');
    assert.equal(looksLikeApacheTomcatHome(tmp, 'linux'), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('probeApacheTomcatHome validates configured CATALINA_HOME strictly', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jwebgen-tcatstub-'));
  try {
    assert.equal(probeApacheTomcatHome({ env: { CATALINA_HOME: tmp }, cfg: {}, platform: 'linux' }).ok, false);
    mkdirSync(path.join(tmp, 'webapps'), { recursive: true });
    mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    mkdirSync(path.join(tmp, 'bin'), { recursive: true });
    writeFileSync(path.join(tmp, 'lib', 'catalina.jar'), '');
    writeFileSync(path.join(tmp, 'bin', 'bootstrap.jar'), '');
    writeFileSync(path.join(tmp, 'bin', 'catalina.sh'), '');
    assert.equal(probeApacheTomcatHome({ env: { CATALINA_HOME: tmp }, cfg: {}, platform: 'linux' }).ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('validateWildflyDeploymentsPath rejects empty and root-only values', () => {
  assert.equal(validateWildflyDeploymentsPath('').ok, false);
  assert.equal(validateWildflyDeploymentsPath('/').ok, false);
  assert.equal(validateWildflyDeploymentsPath('/opt/wildfly/standalone/deployments').ok, true);
});
