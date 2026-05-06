import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSuggestedActions } from '../../src/cli/preflight.js';

test('computeSuggestedActions suggests install actions for missing dependencies', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: false },
      { key: 'maven', ok: false }
    ],
    optional: [],
    npmPath: { hasBin: true, inPath: true, jwebgenReachable: true }
  };
  const actions = computeSuggestedActions(state, 'linux');
  assert.equal(actions.some((a) => a.type === 'install' && a.key === 'java'), true);
  assert.equal(actions.some((a) => a.type === 'install' && a.key === 'maven'), true);
});

test('computeSuggestedActions suggests PATH guidance when npm global bin is missing from PATH', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: true },
      { key: 'maven', ok: true }
    ],
    optional: [],
    npmPath: { hasBin: true, inPath: false, jwebgenReachable: false, bin: '/tmp/npm-global/bin' }
  };
  const actions = computeSuggestedActions(state, 'darwin');
  const pathAction = actions.find((a) => a.type === 'path');
  assert.ok(pathAction);
  assert.match(pathAction.snippets.join('\n'), /PATH/);
});

test('computeSuggestedActions returns empty list when everything is ready', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: true },
      { key: 'maven', ok: true }
    ],
    optional: [],
    npmPath: { hasBin: true, inPath: true, jwebgenReachable: true, bin: '/tmp/npm-global/bin' }
  };
  const actions = computeSuggestedActions(state, 'win32');
  assert.deepEqual(actions, []);
});
