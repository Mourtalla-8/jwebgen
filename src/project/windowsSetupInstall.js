import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Pinned Apache binary releases used by embedded scripts. */
export const WINDOWS_MAVEN_PORTABLE_VERSION = '3.9.9';
export const WINDOWS_TOMCAT_PORTABLE_VERSION = '10.1.39';
export const WINDOWS_WILDFLY_PORTABLE_VERSION = '31.0.1.Final';

const MAVEN_SCRIPT_URL = new URL('../resources/install-maven-windows.ps1', import.meta.url);
const TOMCAT_SCRIPT_URL = new URL('../resources/install-tomcat-windows.ps1', import.meta.url);
const WILDFLY_SCRIPT_URL = new URL('../resources/install-wildfly-windows.ps1', import.meta.url);

const OUTPUT_CAP = 200_000;

function capText(input, cap = OUTPUT_CAP) {
  const text = String(input || '');
  if (text.length <= cap) return text;
  return text.slice(-cap);
}

export function getWindowsMavenPortableScriptPath() {
  return fileURLToPath(MAVEN_SCRIPT_URL);
}

export function getWindowsTomcatPortableScriptPath() {
  return fileURLToPath(TOMCAT_SCRIPT_URL);
}

export function getWindowsWildflyPortableScriptPath() {
  return fileURLToPath(WILDFLY_SCRIPT_URL);
}

async function runPowerShellScript(scriptPath, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const exe = 'powershell.exe';
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  try {
    const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (c) => {
      stdout = capText(stdout + String(c));
    });
    child.stderr?.on('data', (c) => {
      stderr = capText(stderr + String(c));
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    killTimer.unref?.();

    let interrupted = false;
    const onSigint = () => {
      interrupted = true;
      try {
        child.kill('SIGINT');
      } catch {
        /* ignore */
      }
    };
    process.once('SIGINT', onSigint);

    const { code, signal } = await new Promise((resolve) => {
      child.on('exit', (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
      child.on('error', () => resolve({ code: 1, signal: null }));
    });
    process.off('SIGINT', onSigint);
    clearTimeout(killTimer);

    return {
      status: code ?? 1,
      signal: interrupted ? 'SIGINT' : signal || null,
      timedOut,
      error: null,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      status: 1,
      signal: null,
      timedOut: error?.code === 'ETIMEDOUT',
      error,
      stdout,
      stderr
    };
  }
}

/**
 * Installs Maven on Windows via the embedded official-binary script.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, timedOut: boolean, error: Error | null, signal: string | null, stdout: string, stderr: string }>}
 */
export async function runWindowsMavenPortableInstall({ timeoutMs = 10 * 60 * 1000 } = {}) {
  return runPowerShellScript(getWindowsMavenPortableScriptPath(), { timeoutMs });
}

/**
 * Installs Tomcat on Windows via an embedded official-binary script.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, timedOut: boolean, error: Error | null, signal: string | null, stdout: string, stderr: string }>}
 */
export async function runWindowsTomcatPortableInstall({ timeoutMs = 10 * 60 * 1000 } = {}) {
  return runPowerShellScript(getWindowsTomcatPortableScriptPath(), { timeoutMs });
}

/**
 * Installs WildFly on Windows via an embedded official-binary script.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, timedOut: boolean, error: Error | null, signal: string | null, stdout: string, stderr: string }>}
 */
export async function runWindowsWildflyPortableInstall({ timeoutMs = 10 * 60 * 1000 } = {}) {
  return runPowerShellScript(getWindowsWildflyPortableScriptPath(), { timeoutMs });
}
