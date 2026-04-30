import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDevScript } from '../../src/generate/watchTemplate.js';

test('makeDevScript leaves server target unset when unspecified', () => {
  const script = makeDevScript({ serverTarget: null });
  assert.match(script, /export JWEBGEN_SERVER_TARGET="\$\{JWEBGEN_SERVER_TARGET:-\}"/);
  assert.doesNotMatch(script, /:-tomcat/);
});

