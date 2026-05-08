import { fileURLToPath } from 'node:url';

/** Pinned Apache Maven binary release (matches embedded script). */
export const WINDOWS_MAVEN_PORTABLE_VERSION = '3.9.9';

const SCRIPT_URL = new URL('../resources/install-maven-windows.ps1', import.meta.url);

export function getWindowsMavenPortableScriptPath() {
  return fileURLToPath(SCRIPT_URL);
}

/**
 * Installs Maven on Windows via the embedded official-binary script.
 * Command is built for internal execution only (not shown to users).
 */
export async function runWindowsMavenPortableInstall(runCommandImpl) {
  const scriptPath = getWindowsMavenPortableScriptPath();
  const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${JSON.stringify(scriptPath)}`;
  return runCommandImpl(cmd);
}
