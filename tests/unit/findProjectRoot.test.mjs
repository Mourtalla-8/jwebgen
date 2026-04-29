import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { findProjectRoot } from '../../src/cli/projectCliUtils.js';

test('findProjectRoot returns null outside generated project layout', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-root-none-'));
  try {
    const result = findProjectRoot(tmpRoot);
    assert.equal(result, null);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('findProjectRoot resolves from nested path when pom.xml and scripts exist', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-root-hit-'));
  try {
    await writeFile(path.join(tmpRoot, 'pom.xml'), '<project/>', 'utf8');
    await mkdir(path.join(tmpRoot, 'scripts'), { recursive: true });
    await mkdir(path.join(tmpRoot, 'src', 'main', 'java', 'com', 'exo'), { recursive: true });
    const nested = path.join(tmpRoot, 'src', 'main', 'java', 'com', 'exo');
    const result = findProjectRoot(nested);
    assert.equal(result, tmpRoot);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
