import { existsSync, readFileSync } from 'node:fs';
import { jwebgenConfigPath } from './jwebgenLayout.js';

export function parseShellExports(text) {
  const env = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function readJwebgenExports(projectRoot) {
  const cfgPath = jwebgenConfigPath(projectRoot);
  if (!existsSync(cfgPath)) return {};
  try {
    return parseShellExports(readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}
