import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeNodeBuildScript,
  makeNodeDeployScript,
  makeNodeDevScript,
  makeNodeWatchScript
} from '../../src/generate/nodeScriptTemplates.js';

test('makeNodeDeployScript uses Linux-only Tomcat/WildFly path defaults', () => {
  const s = makeNodeDeployScript();
  assert.match(s, /process\.platform === 'linux' \? '\/var\/lib\/tomcat10' : ''/);
  assert.match(s, /process\.platform === 'linux' \? '\/opt\/wildfly' : ''/);
});

test('makeNodeDeployScript resolves WildFly paths from resolved deployments dir', () => {
  const s = makeNodeDeployScript();
  assert.match(s, /path\.join\(resolvedDeployments, appName \+ '\.war'\)/);
});

test('makeNodeDevScript spawns dashboard with inherited TTY streams', () => {
  const s = makeNodeDevScript();
  assert.match(s, /\['ignore', 'inherit', 'inherit'\]/);
});

test('makeNodeBuildScript warns when Maven executable is missing', () => {
  const build = makeNodeBuildScript();
  assert.match(build, /looksLikeMissingMaven/);
  assert.match(build, /Maven not found/);
  assert.match(
    build,
    /Maven not found \(expected mvn\.cmd on PATH\)\. Install Apache Maven from https:\/\/maven\.apache\.org\//
  );
});

test('makeNodeDeployScript wraps deploy IO with guardedAcl for permission errors', () => {
  const deploy = makeNodeDeployScript();
  assert.match(deploy, /async function guardedAcl/);
  assert.match(deploy, /EACCES/);
  assert.match(deploy, /EPERM/);
});

test('makeNodeBuildScript and watch delegate stay Node-first', () => {
  assert.match(makeNodeBuildScript(), /mvn\.cmd/);
  const watch = makeNodeWatchScript();
  assert.match(watch, /dev\.mjs/);
  assert.match(watch, /stdio: 'inherit'/);
});
