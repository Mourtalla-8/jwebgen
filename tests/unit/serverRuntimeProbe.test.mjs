import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideTomcatRunningUnix,
  decideWildflyRunningUnix
} from '../../src/project/serverRuntimeProbe.js';

test('decideTomcatRunningUnix: systemd inactive ignores HTTP 8080 without Catalina', () => {
  assert.equal(decideTomcatRunningUnix({ unit: 'tomcat10', state: 'inactive' }, false, 'up'), false);
  assert.equal(decideTomcatRunningUnix({ unit: 'tomcat10', state: 'inactive' }, null, 'up'), false);
});

test('decideTomcatRunningUnix: systemd inactive + Catalina bootstrap counts as running', () => {
  assert.equal(decideTomcatRunningUnix({ unit: 'tomcat10', state: 'inactive' }, true, 'down'), true);
});

test('decideTomcatRunningUnix: no systemd row falls back to curl when Catalina absent', () => {
  assert.equal(decideTomcatRunningUnix(null, false, 'up'), true);
  assert.equal(decideTomcatRunningUnix(null, false, 'down'), false);
  assert.equal(decideTomcatRunningUnix(null, false, 'unknown'), null);
});

test('decideWildflyRunningUnix: systemd inactive ignores 9990 without WildFly process', () => {
  assert.equal(decideWildflyRunningUnix({ unit: 'wildfly', state: 'failed' }, false, 'up'), false);
  assert.equal(decideWildflyRunningUnix({ unit: 'wildfly', state: 'inactive' }, true, 'down'), true);
});
