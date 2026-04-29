import path from 'node:path';
import { chmod, mkdir, writeFile } from 'node:fs/promises';

export async function writeFileSafe(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

export async function makeExecutable(filePath) {
  try {
    await chmod(filePath, 0o755);
  } catch {
    // Ignore on platforms/filesystems where chmod is not meaningful.
  }
}
