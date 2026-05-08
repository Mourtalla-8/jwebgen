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

test('computeSuggestedActions filters Linux install methods to detected package managers', () => {
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
  const shellCmds = actions
    .filter((a) => a.type === 'install')
    .flatMap((a) => a.installMethods.map((m) => m.shellCommand).filter(Boolean));
  assert.equal(shellCmds.length > 0, true);
  assert.equal(shellCmds.every((c) => /\bpacman\b/i.test(c)), true);
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

test('computeSuggestedActions on win32 suggests embedded Maven when maven is missing', () => {
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
  assert.equal(maven.installMethods.length, 1);
  assert.equal(maven.installMethods[0].internalId, 'maven-windows-portable');
  assert.equal(maven.installMethods[0].shellCommand, null);
});

test('buildInstallFailureHint gives Windows-specific remediation for maven', () => {
  const hint = buildInstallFailureHint('maven', 'win32');
  assert.match(hint, /new session/i);
  assert.match(hint, /mvn -version/);
  assert.match(hint, /--setup --dry-run/);
});

test('buildInstallFailureHint gives generic Linux remediation for node', () => {
  const hint = buildInstallFailureHint('node', 'linux');
  assert.match(hint, /package manager/i);
  assert.match(hint, /--setup --dry-run/);
});

const mockNpm = { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false };

function singleInstallAction(key, shellCommand = 'echo ok') {
  return [
    {
      type: 'install',
      key,
      title: `Install ${key}`,
      installMethods: [
        {
          id: `${key}-m1`,
          label: 'Test method',
          shellCommand,
          previewLine: shellCommand,
          internalId: null
        }
      ]
    }
  ];
}

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
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('node', 'sleep 9999'),
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
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('maven'),
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
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('java'),
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

test('runSetupAssistant supports skipping a multi-method install action (None/skip)', async () => {
  let ran = 0;
  const ok = await runSetupAssistant({
    confirmPrompt: async () => true,
    selectPrompt: async () => SKIP_ACTION,
    collectSetupStateImpl: () => ({
      checks: [{ key: 'java', ok: false, display: 'javac not found', hint: '' }],
      optional: [],
      npmPath: mockNpm
    }),
    computeSuggestedActionsImpl: () => [
      {
        type: 'install',
        key: 'java',
        title: 'Install java',
        installMethods: [
          { id: 'a', label: 'A', shellCommand: 'echo a', previewLine: 'echo a', internalId: null },
          { id: 'b', label: 'B', shellCommand: 'echo b', previewLine: 'echo b', internalId: null }
        ]
      }
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
          npmPath: mockNpm
        }),
        computeSuggestedActionsImpl: () => singleInstallAction('java'),
        runCommandImpl: async () => ({ status: 0, timedOut: false, error: null, signal: null, stdout: '', stderr: '' })
      }),
    (err) => err && err.exitCode === 130
  );
});

test('runSetupAssistant dry-run prints jwebgen --install line without EncodedCommand', async () => {
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
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('java', 'winget install EclipseAdoptium.Temurin.21.JDK'),
      runCommandImpl: () => ({ status: 0, timedOut: false, error: null, signal: null })
    });
    assert.equal(ok, true);
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /jwebgen --install java/);
  assert.doesNotMatch(output, /EncodedCommand/i);
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
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('java'),
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
