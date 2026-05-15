import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideTomcatRunningUnix,
  decideTomcatRunningWindows,
  decideWildflyRunningUnix,
  decideWildflyRunningWindows
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

/** Windows `sc query` + CIM precedence mirrors Linux systemd + process (see decideTomcatRunningUnix). */
test('decideTomcatRunningWindows: service running wins over absent CIM signal', () => {
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'running' }, false), true);
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'start_pending' }, false), true);
});

test('decideTomcatRunningWindows: service stopped still true when Catalina-like JVM present', () => {
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'stopped' }, true), true);
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'stop_pending' }, true), true);
});

test('decideTomcatRunningWindows: service stopped and no JVM match is false', () => {
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'stopped' }, false), false);
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'stopped' }, null), false);
});

test('decideTomcatRunningWindows: no service row falls back to CIM result only', () => {
  assert.equal(decideTomcatRunningWindows(null, true), true);
  assert.equal(decideTomcatRunningWindows(null, false), false);
  assert.equal(decideTomcatRunningWindows(null, null), null);
});

test('decideTomcatRunningWindows: unknown service state defers to CIM', () => {
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'unknown' }, true), true);
  assert.equal(decideTomcatRunningWindows({ name: 'Tomcat10', state: 'unknown' }, null), null);
});

test('decideWildflyRunningWindows: same precedence as Tomcat / Unix WildFly', () => {
  assert.equal(decideWildflyRunningWindows({ name: 'WildFly', state: 'running' }, false), true);
  assert.equal(decideWildflyRunningWindows({ name: 'WildFly', state: 'stopped' }, true), true);
  assert.equal(decideWildflyRunningWindows({ name: 'WildFly', state: 'stopped' }, false), false);
  assert.equal(decideWildflyRunningWindows(null, false), false);
});
