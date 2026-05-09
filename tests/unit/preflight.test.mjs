import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSuggestedActions,
  resolveInstallMethods,
  runSetupAssistant
} from '../../src/cli/preflight.js';

const CANCEL_STEP = '__JWEBGEN_CANCEL_STEP__';
const SKIP_ACTION = '__JWEBGEN_SKIP_ACTION__';

test('computeSuggestedActions suggests install actions for missing dependencies', () => {
  const state = {
    checks: [
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
      { key: 'java', ok: true },
      { key: 'maven', ok: true },
      { key: 'tomcat', ok: true },
      { key: 'wildfly', ok: true }
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
      { key: 'java', ok: true },
      { key: 'maven', ok: true },
      { key: 'tomcat', ok: true },
      { key: 'wildfly', ok: true }
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
      { key: 'java', ok: true },
      { key: 'maven', ok: false },
      { key: 'tomcat', ok: true },
      { key: 'wildfly', ok: true }
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

test('computeSuggestedActions on win32 includes jwebgen internal Java installer option', () => {
  const state = {
    checks: [
      { key: 'java', ok: false },
      { key: 'maven', ok: true },
      { key: 'tomcat', ok: true },
      { key: 'wildfly', ok: true }
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
    hasCommandImpl: (bin) => bin === 'powershell' || bin === 'powershell.exe' || bin === 'winget'
  });
  const java = actions.find((a) => a.type === 'install' && a.key === 'java');
  assert.ok(java);
  assert.equal(java.installMethods.some((m) => m.internalId === 'java-win-jwebgen-internal'), true);
});

test('computeSuggestedActions on win32 suggests embedded Tomcat and WildFly installers', () => {
  const state = {
    checks: [
      { key: 'java', ok: true },
      { key: 'maven', ok: true },
      { key: 'tomcat', ok: false },
      { key: 'wildfly', ok: false }
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
  const tomcat = actions.find((a) => a.type === 'install' && a.key === 'tomcat');
  const wildfly = actions.find((a) => a.type === 'install' && a.key === 'wildfly');
  assert.ok(tomcat);
  assert.ok(wildfly);
  assert.equal(tomcat.installMethods[0].internalId, 'tomcat-windows-portable');
  assert.equal(wildfly.installMethods[0].internalId, 'wildfly-windows-portable');
});

test('resolveInstallMethods returns same Windows methods as setup actions', () => {
  const state = {
    checks: [{ key: 'tomcat', ok: false }],
    optional: [],
    npmPath: { hasShimButNotOnPath: false, hasShimInBin: false, inPath: false, resolvedOutsideBin: false }
  };
  const hasCommandImpl = (bin) => bin === 'powershell' || bin === 'powershell.exe';
  const actions = computeSuggestedActions(state, 'win32', { hasCommandImpl });
  const fromActions = actions.find((a) => a.key === 'tomcat')?.installMethods || [];
  const direct = resolveInstallMethods('tomcat', 'win32', hasCommandImpl);
  assert.deepEqual(direct, fromActions);
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

test('runSetupAssistant classifies timeout failures without remediation block', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await runSetupAssistant({
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'tomcat', ok: false, display: 'missing', hint: '' }],
        optional: [],
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('tomcat', 'sleep 9999'),
      runCommandImpl: () => ({ status: 1, timedOut: true, error: null, signal: null })
    });
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /timed out for tomcat/i);
  assert.doesNotMatch(output, /Remediation:/);
});

test('runSetupAssistant classifies execution errors without remediation block', async () => {
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
  assert.doesNotMatch(output, /Remediation:/);
});

test('runSetupAssistant classifies non-zero exit failures without remediation block', async () => {
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
  assert.doesNotMatch(output, /Remediation:/);
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

test('runSetupAssistant dry-run keeps method/command association without EncodedCommand', async () => {
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
  assert.match(output, /- Test method/);
  assert.match(output, /winget install EclipseAdoptium\.Temurin\.21\.JDK/);
  assert.doesNotMatch(output, /EncodedCommand/i);
});

test('runSetupAssistant dry-run prints method labels for install options', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await runSetupAssistant({
      dryRun: true,
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'tomcat', ok: false, display: 'not installed', hint: '' }],
        optional: [],
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => [
        {
          type: 'install',
          key: 'tomcat',
          title: 'Install tomcat',
          installMethods: [
            { id: 'm1', label: 'Tomcat from apache.org', shellCommand: null, previewLine: null, internalId: 'tomcat-windows-portable' }
          ]
        }
      ]
    });
  } finally {
    console.log = originalLog;
  }
  const output = logs.join('\n');
  assert.match(output, /- Tomcat from apache\.org/);
  assert.match(output, /jwebgen --install tomcat/);
});

test('runSetupAssistant setup mode offers all Java methods including jwebgen internal installer', async () => {
  const seenOptions = [];
  await runSetupAssistant({
    confirmPrompt: async () => false,
    selectPrompt: async ({ options }) => {
      seenOptions.push(...options.map((opt) => String(opt.label)));
      return SKIP_ACTION;
    },
    collectSetupStateImpl: () => ({
      checks: [{ key: 'java', ok: false, display: 'javac not found', hint: '' }],
      optional: [],
      npmPath: mockNpm
    }),
    computeSuggestedActionsImpl: () => computeSuggestedActions({
      checks: [{ key: 'java', ok: false }],
      optional: [],
      npmPath: mockNpm
    }, 'win32', {
      hasCommandImpl: (bin) => (
        bin === 'powershell'
        || bin === 'powershell.exe'
        || bin === 'winget'
      )
    })
  });
  assert.equal(seenOptions.includes('None'), true);
  assert.equal(seenOptions.includes('winget (Eclipse Temurin 21 JDK)'), true);
  assert.equal(seenOptions.includes('winget (Microsoft OpenJDK 21)'), true);
  assert.equal(seenOptions.includes('jwebgen internal installer'), true);
});

test('runSetupAssistant treats winget already-installed/no-upgrade as success', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const ok = await runSetupAssistant({
      confirmPrompt: async () => true,
      collectSetupStateImpl: () => ({
        checks: [{ key: 'java', ok: false, display: 'missing java', hint: '' }],
        optional: [],
        npmPath: mockNpm
      }),
      computeSuggestedActionsImpl: () => singleInstallAction('java', 'winget install EclipseAdoptium.Temurin.21.JDK'),
      runCommandImpl: async () => ({
        status: 1,
        timedOut: false,
        error: null,
        signal: null,
        stdout: 'Found an existing package already installed. Trying to upgrade the installed package...\nNo available upgrade found.',
        stderr: 'No newer package versions are available from the configured sources.'
      })
    });
    assert.equal(ok, false);
  } finally {
    console.log = originalLog;
  }
  assert.match(logs.join('\n'), /\bDone\b/);
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
