import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags, isLikelyLegacySubcommand } from '../../src/cli/flags.js';

test('parseFlags maps --watch to dev action', () => {
  const parsed = parseFlags(['--watch']);
  assert.equal(parsed.action, 'dev');
  assert.equal(parsed.actionCount, 1);
});

test('parseFlags rejects multiple actions via actionCount', () => {
  const parsed = parseFlags(['--dev', '--build']);
  assert.equal(parsed.actionCount, 2);
});

test('parseFlags captures unknown long flags', () => {
  const parsed = parseFlags(['--nope']);
  assert.deepEqual(parsed.unknown, ['--nope']);
});

test('parseFlags parses create-related flags and options', () => {
  const parsed = parseFlags(['--new', '--yes', '--wildfly', 'my-app']);
  assert.equal(parsed.action, 'create');
  assert.equal(parsed.flags.yes, true);
  assert.equal(parsed.flags.server, 'wildfly');
  assert.deepEqual(parsed.flags.args, ['my-app']);
});

test('parseFlags keeps server target unset when omitted', () => {
  const parsed = parseFlags(['--new', '--yes', 'my-app']);
  assert.equal(parsed.action, 'create');
  assert.equal(parsed.flags.server, null);
});

test('isLikelyLegacySubcommand detects old subcommand tokens', () => {
  assert.equal(isLikelyLegacySubcommand('dev'), true);
  assert.equal(isLikelyLegacySubcommand('--dev'), false);
});

