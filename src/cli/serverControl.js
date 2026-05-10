import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { execa } from 'execa';
import { probeApacheTomcatHome, resolveWildflyPaths } from '../project/serverPaths.js';

const TOMCAT_SERVICE_CANDIDATES = ['Tomcat10', 'tomcat10', 'Tomcat', 'tomcat'];
const SPAWN_CONFIRM_TIMEOUT_MS = 2000;

async function commandExists(bin, platform = process.platform) {
  const cmd = platform === 'win32' ? 'where' : 'which';
  try {
    const probe = await execa(cmd, [bin], { timeout: 1500, reject: false });
    return probe.exitCode === 0;
  } catch {
    return false;
  }
}

function mapPgrep(result) {
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  return null;
}

async function probeRuntime(target, platform = process.platform) {
  if (platform === 'win32') {
    const pattern =
      target === 'tomcat'
        ? /tomcat|catalina\.startup|bootstrap\.jar/i
        : /wildfly|jboss\.modules|standalone|jboss\.home/i;
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
  try {
    if (await commandExists('pgrep', platform)) {
      const pattern = target === 'tomcat' ? 'tomcat' : 'standalone.sh|org.jboss.as.standalone';
      const result = await execa('pgrep', ['-f', pattern], { timeout: 2000, reject: false });
      const mapped = mapPgrep(result);
      if (mapped !== null) return mapped;
    }
    if (await commandExists('curl', platform)) {
      const url = target === 'wildfly' ? 'http://127.0.0.1:9990/' : 'http://127.0.0.1:8080/';
      const probe = await execa('curl', ['-fsS', '--max-time', '2', url], { timeout: 3000, reject: false });
      if (probe.exitCode === 0) return true;
      if (probe.exitCode !== 127) return false;
    }
    return null;
  } catch {
    return null;
  }
}

async function trySystemctl(action, unit) {
  if (!(await commandExists('systemctl'))) return false;
  const result = await execa('systemctl', [action, unit], { reject: false });
  return result.exitCode === 0;
}

function spawnDetachedAndConfirm(command, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    try {
      const p = spawn(command, args, options);
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(ok);
      };
      p.once('spawn', () => {
        try {
          p.unref();
        } catch {
          /* ignore unref failures */
        }
        finish(true);
      });
      p.once('error', () => finish(false));
      timer = setTimeout(() => finish(false), SPAWN_CONFIRM_TIMEOUT_MS);
      timer.unref?.();
    } catch {
      resolve(false);
    }
  });
}

async function runTomcatWindows(action, env = process.env) {
  for (const serviceName of TOMCAT_SERVICE_CANDIDATES) {
    const service = await execa('sc.exe', [action === 'start' ? 'start' : 'stop', serviceName], { reject: false });
    if (service.exitCode === 0) return true;
  }
  const home = resolveTomcatHome({ env, platform: 'win32' });
  if (!home) return false;
  const script = action === 'start' ? 'bin\\startup.bat' : 'bin\\shutdown.bat';
  const res = spawnSync('cmd.exe', ['/d', '/c', 'call', script], {
    cwd: home,
    stdio: 'ignore',
    windowsHide: true,
    timeout: 30000
  });
  if (res.error) return false;
  return res.status === 0;
}

async function runWildflyWindows(action, env = process.env) {
  const { wildflyHome } = resolveWildflyPaths({ env, platform: 'win32' });
  if (!wildflyHome) return false;
  if (action === 'stop') {
    const res = spawnSync('cmd.exe', ['/d', '/c', 'call', 'bin\\jboss-cli.bat', '--connect', '--command=:shutdown'], {
      cwd: wildflyHome,
      stdio: 'ignore',
      windowsHide: true,
      timeout: 30000
    });
    if (res.error) return false;
    return res.status === 0;
  }
  return spawnDetachedAndConfirm(
    'cmd.exe',
    ['/d', '/c', 'start', '/B', '""', 'cmd.exe', '/d', '/c', 'call', 'bin\\standalone.bat'],
    {
      cwd: wildflyHome,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }
  );
}

async function runTomcatUnix(action, env = process.env, platform = process.platform) {
  if (platform === 'linux') {
    if (await trySystemctl(action, 'tomcat10')) return true;
    if (await trySystemctl(action, 'tomcat')) return true;
  }
  const probe = probeApacheTomcatHome({ env, cfg: {}, platform });
  const home = probe.ok ? probe.home : '';
  if (!home) return false;
  const script = action === 'start' ? path.join(home, 'bin', 'startup.sh') : path.join(home, 'bin', 'shutdown.sh');
  try {
    const result = await execa(script, [], { reject: false, timeout: 30000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function runWildflyUnix(action, env = process.env, platform = process.platform) {
  if (platform === 'linux' && await trySystemctl(action, 'wildfly')) return true;
  const { wildflyHome } = resolveWildflyPaths({ env, platform });
  if (!wildflyHome) return false;
  if (action === 'stop') {
    const cliSh = path.join(wildflyHome, 'bin', 'jboss-cli.sh');
    const stop = await execa(cliSh, ['--connect', '--command=:shutdown'], { reject: false, timeout: 30000 });
    return stop.exitCode === 0;
  }
  return spawnDetachedAndConfirm(path.join(wildflyHome, 'bin', 'standalone.sh'), [], {
      cwd: wildflyHome,
      detached: true,
      stdio: 'ignore'
    });
}

export async function runGlobalServerCommand(action, target, { platform = process.platform, env = process.env, out = console.log } = {}) {
  if (!['start', 'stop', 'status'].includes(action)) return 1;
  if (!['tomcat', 'wildfly'].includes(target)) return 1;

  if (action === 'status') {
    const running = await probeRuntime(target, platform);
    if (running === true) out(`${target} is running`);
    else if (running === false) out(`${target} is stopped`);
    else out(`${target} status is unknown`);
    return running === null ? 2 : 0;
  }

  const ok = platform === 'win32'
    ? (target === 'tomcat'
      ? await runTomcatWindows(action, env)
      : await runWildflyWindows(action, env))
    : (target === 'tomcat'
      ? await runTomcatUnix(action, env, platform)
      : await runWildflyUnix(action, env, platform));

  if (!ok) {
    out(`Unable to ${action} ${target}. Check your server installation and environment variables.`);
    return 1;
  }
  out(`${target} ${action} command sent`);
  return 0;
}
