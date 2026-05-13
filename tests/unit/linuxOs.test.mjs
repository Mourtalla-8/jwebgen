import test from 'node:test';
import assert from 'node:assert/strict';
import { linuxPmSortIndex } from '../../src/cli/linuxOs.js';

test('linuxPmSortIndex orders curl-based custom after package managers', () => {
  const order = ['apt', 'dnf', 'pacman', 'zypper', 'apk'];
  assert.ok(linuxPmSortIndex('sudo apt install -y wildfly', order) < linuxPmSortIndex('curl -fSL https://x', order));
});
