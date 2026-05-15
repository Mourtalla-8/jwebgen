import test from 'node:test';
import assert from 'node:assert/strict';
import { isUserInterruptExecaError, cliExitCodeForInterrupt } from '../../src/cli/interruptExit.js';

test('isUserInterruptExecaError recognizes SIGINT with exit code 1 only', () => {
  assert.equal(isUserInterruptExecaError({ signal: 'SIGINT', exitCode: 1 }), true);
  assert.equal(isUserInterruptExecaError({ signal: 'SIGINT', exitCode: 0 }), false);
  assert.equal(isUserInterruptExecaError({ signal: 'SIGINT' }), false);
});

test('isUserInterruptExecaError recognizes conventional interrupt exit codes', () => {
  assert.equal(isUserInterruptExecaError({ exitCode: 130 }), true);
  assert.equal(isUserInterruptExecaError({ signal: 'SIGINT', exitCode: 130 }), true);
});

test('isUserInterruptExecaError recognizes Windows STATUS_CONTROL_C_EXIT', () => {
  assert.equal(isUserInterruptExecaError({ exitCode: 3221225786 }), true);
});

test('isUserInterruptExecaError does not treat generic exit 1 as interrupt', () => {
  assert.equal(isUserInterruptExecaError({ exitCode: 1 }), false);
});

test('cliExitCodeForInterrupt maps SIGTERM to 143', () => {
  assert.equal(cliExitCodeForInterrupt({ signal: 'SIGTERM' }), 143);
  assert.equal(cliExitCodeForInterrupt({ exitCode: 143 }), 143);
});
