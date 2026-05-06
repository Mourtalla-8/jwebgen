import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAddJspNodeScript, makeAddServletNodeScript } from '../../src/generate/devAssets.js';

test('makeAddServletNodeScript is standalone node entrypoint', () => {
  const script = makeAddServletNodeScript({ basePackage: 'com.exo.app', appName: 'jwebgen' });
  assert.match(script, /#!\/usr\/bin\/env node/);
  assert.match(script, /fileURLToPath/);
  assert.match(script, /Invalid class name/);
  assert.match(script, /Servlet created:/);
});

test('makeAddJspNodeScript validates jsp names and writes file', () => {
  const script = makeAddJspNodeScript({ appName: 'jwebgen' });
  assert.match(script, /#!\/usr\/bin\/env node/);
  assert.match(script, /Invalid JSP name: path segments are not allowed/);
  assert.match(script, /JSP created:/);
});
