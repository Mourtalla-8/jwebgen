import test from 'node:test';
import assert from 'node:assert/strict';
import { runInstallCli } from '../../src/cli/installCommand.js';

test('runInstallCli rejects unknown tool', async () => {
  const code = await runInstallCli('gradle');
  assert.equal(code, 1);
});
