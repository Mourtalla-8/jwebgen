import test from 'node:test';
import assert from 'node:assert/strict';
import { runGlobalServerCommand } from '../../src/cli/serverControl.js';

test('runGlobalServerCommand rejects unsupported actions', async () => {
  const code = await runGlobalServerCommand('reload', 'tomcat', {
    out: () => {}
  });
  assert.equal(code, 1);
});

test('runGlobalServerCommand rejects unsupported targets', async () => {
  const code = await runGlobalServerCommand('start', 'jetty', {
    out: () => {}
  });
  assert.equal(code, 1);
});
