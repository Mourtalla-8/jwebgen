import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isDirWritableByProcess,
  runTomcatCatalinaVersion,
  windowsScQueryState
} from '../../src/project/serverRuntimeProbe.js';

test('isDirWritableByProcess is true for writable temp dir', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'jwebgen-wr-'));
  try {
    assert.equal(isDirWritableByProcess(d), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('runTomcatCatalinaVersion fails when catalina.sh is not executable', { skip: process.platform === 'win32' }, () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jwebgen-tcatver-'));
  try {
    const bin = path.join(tmp, 'bin');
    const lib = path.join(tmp, 'lib');
    const webapps = path.join(tmp, 'webapps');
    mkdirSync(bin, { recursive: true });
    mkdirSync(lib, { recursive: true });
    mkdirSync(webapps, { recursive: true });
    writeFileSync(path.join(lib, 'catalina.jar'), '');
    writeFileSync(path.join(bin, 'bootstrap.jar'), '');
    writeFileSync(path.join(bin, 'catalina.sh'), '#!/bin/sh\necho test\n');
    chmodSync(path.join(bin, 'catalina.sh'), 0o644);
    const r = runTomcatCatalinaVersion(tmp, 'linux');
    assert.equal(r.ok, false);
    assert.match(String(r.reason || ''), /not executable/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('windowsScQueryState returns null for bogus service when sc is missing', () => {
  assert.equal(windowsScQueryState('__jwebgen_no_such_service__'), null);
});
