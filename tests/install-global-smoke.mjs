import { existsSync, mkdtempSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function run(command, args, options = {}) {
  const useShell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  execFileSync(command, args, { stdio: 'inherit', shell: useShell, ...options });
}

function runCapture(command, args, options = {}) {
  const useShell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  return execFileSync(command, args, { encoding: 'utf8', shell: useShell, ...options });
}

function runCaptureAllowNonZero(command, args, options = {}) {
  try {
    return { status: 0, output: runCapture(command, args, options) };
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 1;
    const output = `${String(error?.stdout || '')}${String(error?.stderr || '')}`;
    return { status, output };
  }
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'jwebgen-global-smoke-'));
const prefixDir = path.join(tmpRoot, 'npm-prefix');
const workDir = path.join(tmpRoot, 'workspace');
mkdirSync(prefixDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const binDir = process.platform === 'win32' ? prefixDir : path.join(prefixDir, 'bin');
const env = {
  ...process.env,
  npm_config_prefix: prefixDir,
  PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const jwebgenCommand = process.platform === 'win32' ? 'jwebgen.cmd' : 'jwebgen';

console.log(`[global-smoke] npm prefix: ${prefixDir}`);
run(npmCommand, ['i', '-g', '.'], { cwd: rootDir, env });

console.log('[global-smoke] jwebgen --help');
run(jwebgenCommand, ['--help'], { cwd: workDir, env });

console.log('[global-smoke] jwebgen --setup --dry-run');
const setupDryRun = runCaptureAllowNonZero(jwebgenCommand, ['--setup', '--dry-run'], { cwd: workDir, env });
if (![0, 1].includes(setupDryRun.status)) {
  throw new Error(`unexpected exit code from --setup --dry-run: ${setupDryRun.status}`);
}
if (!setupDryRun.output.includes('jwebgen setup diagnostics')) {
  throw new Error('setup dry-run output missing diagnostics header');
}

const shouldRunHostInstall = process.env.CI === 'true' || process.env.RUN_GLOBAL_SMOKE === '1';
if (shouldRunHostInstall) {
  console.log('[global-smoke] jwebgen --install maven');
  run(jwebgenCommand, ['--install', 'maven'], { cwd: workDir, env });
} else {
  console.log('[global-smoke] skipped jwebgen --install maven (set RUN_GLOBAL_SMOKE=1 to enable locally)');
}

console.log('[global-smoke] jwebgen --new globalapp --yes');
run(jwebgenCommand, ['--new', 'globalapp', '--yes'], { cwd: workDir, env });

const appDir = path.join(workDir, 'globalapp');
if (!existsSync(path.join(appDir, '.jwebgen', 'scripts'))) {
  throw new Error('missing generated .jwebgen/scripts after global install smoke');
}

console.log('[global-smoke] jwebgen --servlet HelloServlet');
run(jwebgenCommand, ['--servlet', 'HelloServlet'], { cwd: appDir, env });
if (!existsSync(path.join(appDir, 'src', 'main', 'java', 'com', 'exo', 'globalapp', 'web', 'HelloServlet.java'))) {
  throw new Error('servlet generation failed in global install smoke');
}

console.log('[global-smoke] jwebgen --jsp home');
run(jwebgenCommand, ['--jsp', 'home'], { cwd: appDir, env });
if (!existsSync(path.join(appDir, 'src', 'main', 'webapp', 'WEB-INF', 'jsp', 'home.jsp'))) {
  throw new Error('jsp generation failed in global install smoke');
}

console.log('[global-smoke] jwebgen --status with fake TOMCAT_HOME');
const fakeTomcat = path.join(tmpRoot, 'fake-tomcat');
mkdirSync(path.join(fakeTomcat, 'webapps', 'globalapp'), { recursive: true });
const statusOut = runCapture(jwebgenCommand, ['--status'], {
  cwd: appDir,
  env: { ...env, TOMCAT_HOME: fakeTomcat, JWEBGEN_SERVER_TARGET: 'tomcat' }
});
if (!statusOut.includes('Server: tomcat')) {
  throw new Error('status output missing tomcat server marker');
}
console.log('[global-smoke] completed');
