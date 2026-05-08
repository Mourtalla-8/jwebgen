import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Pinned Apache Maven binary release (matches embedded script). */
export const WINDOWS_MAVEN_PORTABLE_VERSION = '3.9.9';

const SCRIPT_URL = new URL('../resources/install-maven-windows.ps1', import.meta.url);

const OUTPUT_CAP = 200_000;

function capText(input, cap = OUTPUT_CAP) {
  const text = String(input || '');
  if (text.length <= cap) return text;
  return text.slice(-cap);
}

export function getWindowsMavenPortableScriptPath() {
  return fileURLToPath(SCRIPT_URL);
}

/**
 * Installs Maven on Windows via the embedded official-binary script.
 * Uses argv (no cmd.exe /c) so the script path is never mis-quoted.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, timedOut: boolean, error: Error | null, signal: string | null, stdout: string, stderr: string }>}
 */
export async function runWindowsMavenPortableInstall({ timeoutMs = 10 * 60 * 1000 } = {}) {
  const scriptPath = getWindowsMavenPortableScriptPath();
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
