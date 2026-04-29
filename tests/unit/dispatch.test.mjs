import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchCommand } from '../../src/cli/dispatch.js';
import { parseCliOptions } from '../../src/cli/projectCliUtils.js';

test('dispatches create when command is empty', async () => {
  let called = '';
  await dispatchCommand(undefined, [], {
    main: async () => {
      called = 'main';
    },
    showHelp: () => {},
    parseCliOptions,
    runProjectScript: async () => {},
    runMigrate: async () => {},
    runClean: async () => {},
    showStatus: async () => {},
    onUnknown: () => {}
  });

  assert.equal(called, 'main');
});

test('dispatches dev with parsed verbose option', async () => {
  let scriptName = '';
  let scriptArgs = [];
  let options = {};
  await dispatchCommand('dev', ['-v', '--flag'], {
    main: async () => {},
    showHelp: () => {},
    parseCliOptions,
    runProjectScript: async (name, args, opts) => {
      scriptName = name;
      scriptArgs = args;
      options = opts;
    },
    runMigrate: async () => {},
    runClean: async () => {},
    showStatus: async () => {},
    onUnknown: () => {}
  });

  assert.equal(scriptName, 'dev.sh');
  assert.deepEqual(scriptArgs, ['--flag']);
  assert.deepEqual(options, { verbose: true });
});

test('dispatches unknown commands via onUnknown', async () => {
  let unknown = '';
  await dispatchCommand('nope', [], {
    main: async () => {},
    showHelp: () => {},
    parseCliOptions,
    runProjectScript: async () => {},
    runMigrate: async () => {},
    runClean: async () => {},
    showStatus: async () => {},
    onUnknown: (command) => {
      unknown = command;
    }
  });

  assert.equal(unknown, 'nope');
});

test('dispatches help aliases without running project scripts', async () => {
  let helpCalled = 0;
  let scriptsCalled = 0;
  await dispatchCommand('--help', [], {
    main: async () => {},
    showHelp: () => {
      helpCalled += 1;
    },
    parseCliOptions,
    runProjectScript: async () => {
      scriptsCalled += 1;
    },
    runMigrate: async () => {},
    runClean: async () => {},
    showStatus: async () => {},
    onUnknown: () => {}
  });

  assert.equal(helpCalled, 1);
  assert.equal(scriptsCalled, 0);
});

test('dispatches build command to build.sh with args', async () => {
  let scriptName = '';
  let scriptArgs = [];
  await dispatchCommand('build', ['--skip'], {
    main: async () => {},
    showHelp: () => {},
    parseCliOptions,
    runProjectScript: async (name, args) => {
      scriptName = name;
      scriptArgs = args;
    },
    runMigrate: async () => {},
    runClean: async () => {},
    showStatus: async () => {},
    onUnknown: () => {}
  });

  assert.equal(scriptName, 'build.sh');
  assert.deepEqual(scriptArgs, ['--skip']);
});
