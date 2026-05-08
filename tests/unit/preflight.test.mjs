import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallFailureHint, computeSuggestedActions, runSetupAssistant } from '../../src/cli/preflight.js';

const CANCEL_STEP = '__JWEBGEN_CANCEL_STEP__';
const SKIP_ACTION = '__JWEBGEN_SKIP_ACTION__';

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
  const actions = computeSuggestedActions(state, 'linux', {
    hasCommandImpl: () => true
  });
  assert.equal(actions.some((a) => a.type === 'install' && a.key === 'java'), true);
  assert.equal(actions.some((a) => a.type === 'install' && a.key === 'maven'), true);
});

test('computeSuggestedActions filters Linux install commands to detected package managers', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: false },
      { key: 'maven', ok: false }
    ],
    optional: [],
    npmPath: { hasBin: true, inPath: true, jwebgenReachable: true, hasShimButNotOnPath: false }
  };
  const hasCommandImpl = (bin) => bin === 'pacman';
  const actions = computeSuggestedActions(state, 'linux', { hasCommandImpl });
  const installCmds = actions.filter((a) => a.type === 'install').flatMap((a) => a.commands);
  assert.equal(installCmds.length > 0, true);
  assert.equal(installCmds.every((c) => /\bpacman\b/i.test(c)), true);
});

test('computeSuggestedActions returns no install actions when no package manager is detected', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: false },
      { key: 'maven', ok: false }
    ],
    optional: [],
    npmPath: { hasBin: true, inPath: true, jwebgenReachable: true, hasShimButNotOnPath: false }
  };
  const actions = computeSuggestedActions(state, 'linux', {
    hasCommandImpl: () => false
  });
  assert.equal(actions.some((a) => a.type === 'install'), false);
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
  const actions = computeSuggestedActions(state, 'darwin', {
    hasCommandImpl: () => true
  });
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
  const actions = computeSuggestedActions(state, 'win32', {
    hasCommandImpl: () => true
  });
  assert.deepEqual(actions, []);
});

test('computeSuggestedActions on win32 suggests portable Maven when maven is missing', () => {
  const state = {
    checks: [
      { key: 'node', ok: true },
      { key: 'java', ok: true },
      { key: 'maven', ok: false }
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
  const actions = computeSuggestedActions(state, 'win32', {
    hasCommandImpl: (bin) => bin === 'powershell' || bin === 'powershell.exe'
  });
  const maven = actions.find((a) => a.type === 'install' && a.key === 'maven');
  assert.ok(maven);
  assert.match(maven.commands[0], /^powershell(\.exe)?\s/i);
  assert.match(maven.commands[0], /-EncodedCommand\s+\S+/);
});

test('buildInstallFailureHint gives Windows-specific remediation', () => {
  const hint = buildInstallFailureHint('maven', 'win32');
  assert.match(hint, /terminal|VS Code/i);
  assert.match(hint, /mvn -version/);
  assert.match(hint, /--setup --dry-run/);
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

test('runSetupAssistant supports skipping a multi-command install action (None/skip)', async () => {
  let ran = 0;
  const ok = await runSetupAssistant({
    confirmPrompt: async () => true,
    selectPrompt: async () => SKIP_ACTION,
    collectSetupStateImpl: () => ({
      checks: [{ key: 'java', ok: false, display: 'javac not found', hint: '' }],
      optional: [],
      npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
    }),
    computeSuggestedActionsImpl: () => [
      { type: 'install', key: 'java', title: 'Install java', commands: ['cmd1', 'cmd2'] }
    ],
    runCommandImpl: async () => {
      ran += 1;
      return { status: 0, timedOut: false, error: null, signal: null, stdout: '', stderr: '' };
    }
  });
  assert.equal(ok, false);
  assert.equal(ran, 0);
});

test('runSetupAssistant treats cancel-step at first action as cancellation (exitCode 130)', async () => {
  await assert.rejects(
    () =>
      runSetupAssistant({
        confirmPrompt: async () => CANCEL_STEP,
        selectPrompt: async () => CANCEL_STEP,
        collectSetupStateImpl: () => ({
          checks: [{ key: 'java', ok: false, display: 'javac not found', hint: '' }],
          optional: [],
          npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
        }),
        runCommandImpl: async () => ({ status: 0, timedOut: false, error: null, signal: null, stdout: '', stderr: '' })
      }),
    (err) => err && err.exitCode === 130
  );
});

test('runSetupAssistant dry-run does not repeat command previews', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const ok = await runSetupAssistant({
      dryRun: true,
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'java', ok: false, display: 'javac not found', hint: '' }],
        optional: [],
        npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
      }),
      runCommandImpl: () => ({ status: 0, timedOut: false, error: null, signal: null })
    });
    assert.equal(ok, true);
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.doesNotMatch(output, /Dry-run preview:/i);
});

test('runSetupAssistant shows only tail on failure when not verbose', async () => {
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
      runCommandImpl: async () => ({
        status: 2,
        timedOut: false,
        error: null,
        signal: null,
        stdout: Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n'),
        stderr: ''
      })
    });
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /Last output \(tail\):/);
  assert.match(output, /line 200/);
});
