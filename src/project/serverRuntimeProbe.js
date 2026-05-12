import { spawnSync } from 'node:child_process';
import { execa } from 'execa';
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

async function commandExists(bin, platform = process.platform) {
  const cmd = platform === 'win32' ? 'where' : 'which';
  try {
    const probe = await execa(cmd, [bin], { timeout: 1500, reject: false });
    return probe.exitCode === 0;
  } catch {
    return false;
  }
}

function mapPgrepExit(result) {
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  return null;
}

/** True when a JVM is running the Catalina bootstrap (not merely "tomcat" in argv). */
export async function javaCatalinaBootstrapRunning(platform = process.platform) {
  if (platform === 'win32') return null;
  if (!(await commandExists('pgrep', platform))) return null;
  const result = await execa(
    'pgrep',
    ['-f', 'org.apache.catalina.startup.Bootstrap'],
    { timeout: 2000, reject: false }
  );
  return mapPgrepExit(result);
}

export async function javaWildFlyLikeProcessRunning(platform = process.platform) {
  if (platform === 'win32') return null;
  if (!(await commandExists('pgrep', platform))) return null;
  const result = await execa('pgrep', ['-f', 'org\\.jboss\\.modules\\.Main|org\\.jboss\\.as\\.standalone|org\\.wildfly\\.boot\\.jar'], {
    timeout: 2000,
    reject: false
  });
  return mapPgrepExit(result);
}

/**
 * Linux packaged Tomcat: when systemd says inactive, do not treat HTTP:8080 alone as Tomcat.
 * @param {{ unit: string, state: string } | null} systemdTomcat
 * @param {boolean | null} catalinaRunning
 * @param {'up'|'down'|'unknown'} curl8080
 * @returns {boolean | null}
 */
export function decideTomcatRunningUnix(systemdTomcat, catalinaRunning, curl8080) {
  if (systemdTomcat?.state === 'active') return true;
  if (systemdTomcat && systemdTomcat.state !== 'active') {
    return catalinaRunning === true;
  }
  if (catalinaRunning === true) return true;
  if (curl8080 === 'up') return true;
  if (curl8080 === 'down') return false;
  return null;
}

/**
 * @param {{ unit: string, state: string } | null} systemdWildfly
 * @param {boolean | null} wildflyProcess
 * @param {'up'|'down'|'unknown'} curl9990
 */
export function decideWildflyRunningUnix(systemdWildfly, wildflyProcess, curl9990) {
  if (systemdWildfly?.state === 'active') return true;
  if (systemdWildfly && systemdWildfly.state !== 'active') {
    return wildflyProcess === true;
  }
  if (wildflyProcess === true) return true;
  if (curl9990 === 'up') return true;
  if (curl9990 === 'down') return false;
  return null;
}

async function probeTomcatWindows() {
  const pattern = /tomcat|catalina\.startup|bootstrap\.jar/i;
  try {
    const { stdout, exitCode } = await execa(
      'powershell.exe',
      [
        '-NoProfile',
        '-NoLogo',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "java.exe" } | ForEach-Object { $_.CommandLine }'
      ],
      { timeout: 12000, windowsHide: true, reject: false }
    );
    if (exitCode !== 0 && !stdout) return null;
    const text = String(stdout || '');
    if (!text.trim()) return false;
    return pattern.test(text);
  } catch {
    return null;
  }
}

async function probeWildflyWindows() {
  const pattern = /org\.jboss\.modules\.Main|org\.jboss\.as\.standalone|org\.wildfly\.boot\.jar/i;
  try {
    const { stdout, exitCode } = await execa(
      'powershell.exe',
      [
        '-NoProfile',
        '-NoLogo',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "java.exe" } | ForEach-Object { $_.CommandLine }'
      ],
      { timeout: 12000, windowsHide: true, reject: false }
    );
    if (exitCode !== 0 && !stdout) return null;
    const text = String(stdout || '');
    if (!text.trim()) return false;
    return pattern.test(text);
  } catch {
    return null;
  }
}

/** Whether Tomcat appears to be running (systemd + Catalina process; HTTP 8080 only as fallback when systemd is inconclusive). */
export async function probeTomcatRuntime({ platform = process.platform } = {}) {
  if (platform === 'win32') return probeTomcatWindows();

  const systemdTomcat = platform === 'linux' ? describeFirstResolvedSystemdUnit(['tomcat10', 'tomcat']) : null;
  const catalinaRunning = await javaCatalinaBootstrapRunning(platform);
  let curl8080 = /** @type {'up'|'down'|'unknown'} */ ('unknown');
  if (await commandExists('curl', platform)) {
    curl8080 = curlHttpProbe('http://127.0.0.1:8080/');
  }
  return decideTomcatRunningUnix(systemdTomcat, catalinaRunning, curl8080);
}

/** Whether WildFly appears to be running (same idea as Tomcat for 9990). */
export async function probeWildflyRuntime({ platform = process.platform } = {}) {
  if (platform === 'win32') return probeWildflyWindows();

  const systemdWildfly = platform === 'linux' ? describeFirstResolvedSystemdUnit(['wildfly']) : null;
  const wildflyProcess = await javaWildFlyLikeProcessRunning(platform);
  let curl9990 = /** @type {'up'|'down'|'unknown'} */ ('unknown');
  if (await commandExists('curl', platform)) {
    curl9990 = curlHttpProbe('http://127.0.0.1:9990/');
  }
  return decideWildflyRunningUnix(systemdWildfly, wildflyProcess, curl9990);
}
