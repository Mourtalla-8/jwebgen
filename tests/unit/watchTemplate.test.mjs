import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDevScript, makeWatchScript } from '../../src/generate/watchTemplate.js';

test('makeDevScript leaves server target unset when unspecified', () => {
  const script = makeDevScript({ serverTarget: null });
  assert.match(script, /export JWEBGEN_SERVER_TARGET="\$\{JWEBGEN_SERVER_TARGET:-\}"/);
  assert.doesNotMatch(script, /:-tomcat/);
});

test('makeWatchScript resolves Maven root and keeps dev state under .jwebgen', () => {
  const script = makeWatchScript();
  assert.match(script, /ROOT_DIR="\$\(cd "\$SCRIPT_DIR\/\.\.\/\.\." && pwd\)"/);
  assert.match(script, /STATE_FILE="\$ROOT_DIR\/\.jwebgen\/\.jwebgen-dev-state\.json"/);
});

