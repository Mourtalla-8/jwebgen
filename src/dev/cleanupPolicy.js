import { readFile } from 'node:fs/promises';

export async function isJwebgenOwnedPid(stateFile, pid) {
  try {
    const raw = await readFile(stateFile, 'utf8');
    const re = new RegExp(`"pid"\\s*:\\s*${String(pid)}`);
    return re.test(raw);
  } catch {
    return false;
  }
}

