import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { printUnknownCommandAndExit } from '../../src/cli/projectCliUtils.js';

describe('cliErrors', { concurrency: false }, () => {
test('printUnknownCommandAndExit prints help and exits with code 1', () => {
  const logs = [];
  const originalLog = console.log;
  const originalExit = process.exit;

  console.log = (...args) => {
    logs.push(args.join(' '));
  };

  process.exit = (code) => {
    const err = new Error(`EXIT:${code}`);
    throw err;
  };

  try {
    assert.throws(
      () => printUnknownCommandAndExit('bad-cmd'),
      (error) => error instanceof Error && error.message === 'EXIT:1'
    );
  } finally {
    console.log = originalLog;
    process.exit = originalExit;
  }

  const combined = logs.join('\n');
  assert.match(combined, /Unknown command/);
  assert.match(combined, /Usage:[^\n]*jwebgen/);
});
});
