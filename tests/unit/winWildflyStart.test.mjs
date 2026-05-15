import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIN_WILDFLY_START_CMD_ARGS,
  buildWinWildflySpawnOptions,
  embedWinWildflySpawnFunctionSource,
  winWildflyBinDir
} from '../../src/project/winWildflyStart.js';

test('buildWinWildflySpawnOptions uses cmd start /MIN and JBOSS_HOME env', () => {
  const home = 'C:\\jwebgen\\wildfly-39.0.1.Final';
  const { command, args, options } = buildWinWildflySpawnOptions(home, { PATH: 'x' });
  assert.equal(command, 'cmd.exe');
  assert.deepEqual(args, WIN_WILDFLY_START_CMD_ARGS);
  assert.match(args.join(' '), /start.*\/MIN.*standalone\.bat/);
  assert.doesNotMatch(args.join(' '), /\bcall\b/);
  assert.equal(options.cwd, winWildflyBinDir(home));
  assert.equal(options.detached, true);
  assert.equal(options.windowsHide, true);
  assert.equal(options.env.JBOSS_HOME, home);
  assert.equal(options.env.WILDFLY_HOME, home);
  assert.equal(options.env.PATH, 'x');
});

test('embedWinWildflySpawnFunctionSource uses cmd start /MIN not Start-Process on bat', () => {
  const src = embedWinWildflySpawnFunctionSource();
  assert.match(src, /function spawnWinWildflyServer/);
  assert.match(src, /'\/MIN'/);
  assert.match(src, /'start'/);
  assert.match(src, /'standalone\.bat'/);
  assert.doesNotMatch(src, /\bcall\b.*standalone\.bat/);
  assert.doesNotMatch(src, /Start-Process -WindowStyle Hidden/);
  const iBat = src.indexOf("path.join(home, 'bin', 'standalone.bat')");
  const iPs1 = src.indexOf("path.join(home, 'bin', 'standalone.ps1')");
  assert.ok(iBat >= 0 && iPs1 >= 0 && iBat < iPs1);
  const batSpawn = src.slice(iBat, iPs1);
  assert.match(batSpawn, /cwd: binDir/);
  assert.match(batSpawn, /JBOSS_HOME: home/);
  assert.match(batSpawn, /WILDFLY_HOME: home/);
  const ps1Spawn = src.slice(iPs1);
  assert.match(ps1Spawn, /JBOSS_HOME: home/);
  assert.match(ps1Spawn, /WILDFLY_HOME: home/);
  assert.match(ps1Spawn, /'-File',\s*ps1Abs/);
});
