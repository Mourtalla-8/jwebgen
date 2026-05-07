import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  LINUX_DEFAULT_TOMCAT_HOME,
  LINUX_DEFAULT_WILDFLY_HOME,
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

test('validateWildflyDeploymentsPath rejects empty and root-only values', () => {
  assert.equal(validateWildflyDeploymentsPath('').ok, false);
  assert.equal(validateWildflyDeploymentsPath('/').ok, false);
  assert.equal(validateWildflyDeploymentsPath('/opt/wildfly/standalone/deployments').ok, true);
});
