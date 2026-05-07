import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallFailureHint, computeSuggestedActions, runSetupAssistant } from '../../src/cli/preflight.js';

test('computeSuggestedActions suggests install actions for missing dependencies', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: false },
      { key: 'maven', ok: false }
    ],
    optional: [],
    npmPath: { hasBin: true, inPath: true, jwebgenReachable: true, hasShimButNotOnPath: false }
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
    npmPath: {
      hasBin: true,
      inPath: false,
      jwebgenReachable: false,
      hasShimButNotOnPath: true,
      bin: '/tmp/npm-global/bin'
    }
  };
  const actions = computeSuggestedActions(state, 'darwin');
  const pathAction = actions.find((a) => a.type === 'path');
  assert.ok(pathAction);
  const joinedSnippets = pathAction.snippets.join('\n');
  assert.match(joinedSnippets, /export PATH=|PATH=/);
  assert.match(joinedSnippets, /Rollback/);
  assert.doesNotMatch(joinedSnippets, />>\s*~\/\.zshrc/);
  assert.doesNotMatch(joinedSnippets, /SetEnvironmentVariable/);
  assert.doesNotMatch(joinedSnippets, /set -Ux/);
});

test('computeSuggestedActions returns empty list when everything is ready', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: true },
      { key: 'maven', ok: true }
    ],
    optional: [],
    npmPath: {
      hasBin: true,
      inPath: true,
      jwebgenReachable: true,
      hasShimButNotOnPath: false,
      bin: '/tmp/npm-global/bin'
    }
  };
  const actions = computeSuggestedActions(state, 'win32');
  assert.deepEqual(actions, []);
});

test('buildInstallFailureHint gives Windows-specific remediation', () => {
  const hint = buildInstallFailureHint('maven', 'win32');
  assert.match(hint, /winget/i);
  assert.match(hint, /mvn -version/);
});

test('buildInstallFailureHint gives generic Linux remediation', () => {
  const hint = buildInstallFailureHint('node', 'linux');
  assert.match(hint, /package manager/i);
  assert.match(hint, /--setup --dry-run/);
});

test('runSetupAssistant classifies timeout failures and prints remediation hint', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await runSetupAssistant({
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'node', ok: false, display: 'missing node', hint: '' }],
        optional: [],
        npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
      }),
      runCommandImpl: () => ({ status: 1, timedOut: true, error: null, signal: null })
    });
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /timed out for node/i);
  assert.match(output, /Remediation:/);
  assert.match(output, /--setup --dry-run/);
});

test('runSetupAssistant classifies execution errors and prints remediation hint', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await runSetupAssistant({
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'maven', ok: false, display: 'missing maven', hint: '' }],
        optional: [],
        npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
      }),
      runCommandImpl: () => {
        throw new Error('boom');
      }
    });
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /execution error for maven/i);
  assert.match(output, /Remediation:/);
  assert.match(output, new RegExp(buildInstallFailureHint('maven').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('runSetupAssistant classifies non-zero exit failures and prints remediation hint', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await runSetupAssistant({
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'java', ok: false, display: 'missing java', hint: '' }],
        optional: [],
        npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
      }),
      runCommandImpl: () => ({ status: 2, timedOut: false, error: null, signal: null })
    });
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /failed for java \(exit 2\)/i);
  assert.match(output, /Remediation:/);
  assert.match(output, new RegExp(buildInstallFailureHint('java').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
