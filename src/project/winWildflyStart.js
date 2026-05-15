import { existsSync } from 'node:fs';
import path from 'node:path';

/** cmd.exe argv: start minimized console running standalone.bat from bin (no call — avoids interactive pause). */
export const WIN_WILDFLY_START_CMD_ARGS = ['/d', '/c', 'start', '', '/MIN', 'standalone.bat'];

/**
 * @param {string} wildflyHome
 * @returns {string}
 */
export function winWildflyBinDir(wildflyHome) {
  return path.join(String(wildflyHome || '').trim(), 'bin');
}

/**
 * @param {string} wildflyHome
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildWinWildflySpawnOptions(wildflyHome, env = process.env) {
  const home = String(wildflyHome || '').trim();
  const binDir = winWildflyBinDir(home);
  return {
    command: 'cmd.exe',
    args: WIN_WILDFLY_START_CMD_ARGS,
    options: {
      cwd: binDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...env,
        JBOSS_HOME: home,
        WILDFLY_HOME: home
      }
    }
  };
}

/**
 * @param {string} wildflyHome
 * @param {NodeJS.ProcessEnv} env
 * @param {(command: string, args: string[], options: object) => Promise<boolean>} spawnDetachedAndConfirm
 * @returns {Promise<boolean>}
 */
export async function tryStartWildflyWindowsDetached(wildflyHome, env, spawnDetachedAndConfirm) {
  const home = String(wildflyHome || '').trim();
  if (!home) return false;

  const bat = path.join(home, 'bin', 'standalone.bat');
  if (existsSync(bat)) {
    const { command, args, options } = buildWinWildflySpawnOptions(home, env);
    return spawnDetachedAndConfirm(command, args, options);
  }

  const ps1 = path.join(home, 'bin', 'standalone.ps1');
  if (existsSync(ps1)) {
    return spawnDetachedAndConfirm(
      'powershell.exe',
      [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.resolve(ps1)
      ],
      {
        cwd: home,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: {
          ...env,
          JBOSS_HOME: home,
          WILDFLY_HOME: home
        }
      }
    );
  }

  return false;
}

/**
 * Source for `spawnWinWildflyServer` inside embedded dev worker (no package imports at runtime).
 * @returns {string}
 */
export function embedWinWildflySpawnFunctionSource() {
  return `function spawnWinWildflyServer(home) {
  const bat = path.join(home, 'bin', 'standalone.bat');
  if (existsSync(bat)) {
    try {
      const binDir = path.join(home, 'bin');
      const p = spawn('cmd.exe', ['/d', '/c', 'start', '', '/MIN', 'standalone.bat'], {
        cwd: binDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, JBOSS_HOME: home, WILDFLY_HOME: home }
      });
      p.on('error', () => {});
      p.unref();
      return true;
    } catch {
      /* fall through to standalone.ps1 */
    }
  }
  try {
    const ps1 = path.join(home, 'bin', 'standalone.ps1');
    if (existsSync(ps1)) {
      const ps1Abs = path.resolve(ps1);
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-WindowStyle',
          'Hidden',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          ps1Abs
        ],
        {
          cwd: home,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          env: { ...process.env, JBOSS_HOME: home, WILDFLY_HOME: home }
        }
      );
      ps.on('error', () => {});
      ps.unref();
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}`;
}
