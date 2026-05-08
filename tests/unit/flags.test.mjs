import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFlagsHelp, parseFlags, isLikelyLegacySubcommand } from '../../src/cli/flags.js';

test('parseFlags maps --watch to dev action', () => {
  const parsed = parseFlags(['--watch']);
  assert.equal(parsed.action, 'dev');
  assert.equal(parsed.actionCount, 1);
});

test('parseFlags maps --version, -V and -v', () => {
  assert.equal(parseFlags(['--version']).action, 'version');
  assert.equal(parseFlags(['-V']).action, 'version');
  assert.equal(parseFlags(['-v']).action, 'version');
});

test('parseFlags keeps verbose explicit via --verbose only', () => {
  const parsed = parseFlags(['--dev', '--verbose']);
  assert.equal(parsed.action, 'dev');
  assert.equal(parsed.flags.verbose, true);
  assert.equal(parsed.flags.version, false);
});

test('parseFlags maps setup/update/uninstall lifecycle actions', () => {
  assert.equal(parseFlags(['--setup']).action, 'setup');
  assert.equal(parseFlags(['--update']).action, 'update');
  assert.equal(parseFlags(['--uninstall']).action, 'uninstall');
});

test('parseFlags supports setup dry-run toggle', () => {
  const parsed = parseFlags(['--setup', '--dry-run']);
  assert.equal(parsed.action, 'setup');
  assert.equal(parsed.flags.dryRun, true);
});

test('parseFlags maps --install with tool argument', () => {
  const parsed = parseFlags(['--install', 'maven']);
  assert.equal(parsed.action, 'install');
  assert.equal(parsed.flags.install, true);
  assert.equal(parsed.flags.installTool, 'maven');
});

test('parseFlags maps install before setup when both appear', () => {
  const parsed = parseFlags(['--install', 'java', '--setup']);
  assert.equal(parsed.actionCount, 2);
  assert.equal(parsed.flags.installTool, 'java');
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

test('parseFlags maps --jsp to jsp action with args', () => {
  const parsed = parseFlags(['--jsp', 'home']);
  assert.equal(parsed.action, 'jsp');
  assert.equal(parsed.flags.jsp, true);
  assert.deepEqual(parsed.flags.args, ['home']);
});

test('parseFlags supports clean deploy combo as single action', () => {
  const parsed = parseFlags(['--clean', '--deploy']);
  assert.equal(parsed.flags.cleanDeploy, true);
  assert.equal(parsed.action, 'clean');
  assert.equal(parsed.actionCount, 1);
});

test('isLikelyLegacySubcommand detects old subcommand tokens', () => {
  assert.equal(isLikelyLegacySubcommand('dev'), true);
  assert.equal(isLikelyLegacySubcommand('--dev'), false);
});

test('formatFlagsHelp includes lifecycle commands for setup/update/uninstall', () => {
  const help = formatFlagsHelp({ appName: 'jwebgen' });
  assert.match(help, /--setup \[--dry-run\]/);
  assert.match(help, /--install <java\|maven\|node>/);
  assert.match(help, /--update/);
  assert.match(help, /--uninstall/);
  assert.match(help, /--version, -V, -v/);
  assert.match(help, /--verbose/);
});

