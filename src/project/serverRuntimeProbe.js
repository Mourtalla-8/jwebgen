import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';

const TOMCAT_WIN_SERVICE_NAMES = ['Tomcat10', 'tomcat10', 'Tomcat', 'tomcat'];
const WILDFLY_WIN_SERVICE_NAMES = ['WildFly', 'wildfly'];

function mergeOut(r) {
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
}

/** @returns {{ ok: boolean, line?: string, reason?: string }} */
export function runTomcatCatalinaVersion(home, platform = process.platform) {
  const root = String(home || '').trim();
  if (!root || !existsSync(root)) return { ok: false, reason: 'Tomcat home missing' };
  const binDir = path.join(root, 'bin');
  const bat = path.join(binDir, 'catalina.bat');
  const sh = path.join(binDir, 'catalina.sh');
  if (platform === 'win32') {
    if (!existsSync(bat)) return { ok: false, reason: 'catalina.bat not found' };
    const env = { ...process.env, CATALINA_HOME: root };
    const r = spawnSync('cmd.exe', ['/d', '/c', 'call', bat, 'version'], {
      cwd: binDir,
      env,
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true
    });
    const text = mergeOut(r);
    if (r.error || r.status !== 0 || !/\bApache\s+Tomcat\b/i.test(text)) {
      return { ok: false, reason: 'catalina version failed (check JAVA_HOME and CATALINA_HOME)' };
    }
    const line = text.split(/\r?\n/).find((l) => /\bApache\s+Tomcat\b/i.test(l)) || text.split(/\r?\n/)[0];
    return { ok: true, line: String(line || '').trim() };
  }
  if (!existsSync(sh)) return { ok: false, reason: 'catalina.sh not found' };
  try {
    accessSync(sh, constants.X_OK);
  } catch {
    return { ok: false, reason: 'catalina.sh is not executable' };
  }
  const env = { ...process.env, CATALINA_HOME: root };
  const r = spawnSync(sh, ['version'], { cwd: binDir, env, encoding: 'utf8', timeout: 20_000 });
  const text = mergeOut(r);
  if (r.error || r.status !== 0 || !/\bApache\s+Tomcat\b/i.test(text)) {
    return { ok: false, reason: 'catalina version failed (check Java install and permissions)' };
  }
  const line = text.split(/\r?\n/).find((l) => /\bApache\s+Tomcat\b/i.test(l)) || text.split(/\r?\n/)[0];
  return { ok: true, line: String(line || '').trim() };
}

/** @returns {{ ok: boolean, line?: string, reason?: string }} */
export function runWildflyCliVersion(home, platform = process.platform) {
  const root = String(home || '').trim();
  if (!root || !existsSync(root)) return { ok: false, reason: 'WildFly home missing' };
  const binDir = path.join(root, 'bin');
  const bat = path.join(binDir, 'jboss-cli.bat');
  const sh = path.join(binDir, 'jboss-cli.sh');
  const env = { ...process.env, JBOSS_HOME: root, WILDFLY_HOME: root };
  const tryCli = (args) => {
    if (platform === 'win32') {
      return spawnSync('cmd.exe', ['/d', '/c', 'call', bat, ...args], {
        cwd: binDir,
        env,
        encoding: 'utf8',
        timeout: 20_000,
        windowsHide: true
      });
    }
    return spawnSync(sh, args, { cwd: binDir, env, encoding: 'utf8', timeout: 20_000 });
  };
  if (platform === 'win32') {
    if (!existsSync(bat)) return { ok: false, reason: 'jboss-cli.bat not found' };
  } else {
    if (!existsSync(sh)) return { ok: false, reason: 'jboss-cli.sh not found' };
    try {
      accessSync(sh, constants.X_OK);
    } catch {
      return { ok: false, reason: 'jboss-cli.sh is not executable' };
    }
  }
  for (const args of [['--version'], ['-v']]) {
    const r = tryCli(args);
    const text = mergeOut(r);
    if (!r.error && r.status === 0 && text) {
      const line = text.split(/\r?\n/).find(Boolean) || '';
      return { ok: true, line: String(line).trim() };
    }
  }
  return { ok: false, reason: 'jboss-cli version probe failed' };
}

export function isDirWritableByProcess(dir) {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Uses `systemctl is-active` (exit 0 = active, 3 = inactive, 4 = unknown unit).
 * @returns {{ unit: string, state: string } | null}
 */
export function describeFirstResolvedSystemdUnit(candidates) {
  for (const unit of candidates) {
    const r = spawnSync('systemctl', ['is-active', unit], { encoding: 'utf8', timeout: 4000 });
    if (r.error?.code === 'ENOENT') return null;
    if (r.status === 4) continue;
    const out = String(r.stdout || '').trim();
    if (r.status === 0) return { unit, state: out || 'active' };
    if (r.status === 3) return { unit, state: out || 'inactive' };
  }
  return null;
}

/** @returns {string | null} */
export function windowsScQueryState(serviceName) {
  const r = spawnSync('sc.exe', ['query', serviceName], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (r.error || r.status !== 0) return null;
  const text = String(r.stdout || '');
  if (/STATE\s*:\s*\d+\s+RUNNING/i.test(text)) return 'running';
  if (/STATE\s*:\s*\d+\s+STOPPED/i.test(text)) return 'stopped';
  if (/STATE\s*:\s*\d+\s+START_PENDING/i.test(text)) return 'start_pending';
  if (/STATE\s*:\s*\d+\s+STOP_PENDING/i.test(text)) return 'stop_pending';
  return 'unknown';
}

export function describeWindowsTomcatService() {
  for (const name of TOMCAT_WIN_SERVICE_NAMES) {
    const st = windowsScQueryState(name);
    if (st) return { name, state: st };
  }
  return null;
}

export function describeWindowsWildflyService() {
  for (const name of WILDFLY_WIN_SERVICE_NAMES) {
    const st = windowsScQueryState(name);
    if (st) return { name, state: st };
  }
  return null;
}

/** HTTP GET probe via curl when available. @returns {'up'|'down'|'unknown'} */
export function curlHttpProbe(url, timeoutSec = 2) {
  const r = spawnSync('curl', ['-fsS', '--max-time', String(timeoutSec), url], {
    encoding: 'utf8',
    timeout: (timeoutSec + 1) * 1000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (r.error && r.error.code === 'ENOENT') return 'unknown';
  if (r.status === 0) return 'up';
  return 'down';
}
