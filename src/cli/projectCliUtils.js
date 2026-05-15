import pc from 'picocolors';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jwebgenConfigPath, jwebgenScriptsDir } from '../project/jwebgenLayout.js';
import { formatFlagsHelp } from './flags.js';

export function findProjectRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    if (
      existsSync(path.join(dir, 'pom.xml')) &&
      (existsSync(path.join(jwebgenScriptsDir(dir), 'watch.mjs')) ||
        existsSync(path.join(jwebgenScriptsDir(dir), 'watch.sh')))
    )
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function parseCliOptions(args = []) {
  const options = { verbose: false, scriptArgs: [] };
  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
      continue;
    }
    options.scriptArgs.push(arg);
  }
  return options;
}

export function detectServerTargetFromProject(projectRoot) {
  const cfgPath = jwebgenConfigPath(projectRoot);
  if (existsSync(cfgPath)) {
    try {
      const rawCfg = readFileSync(cfgPath, 'utf8');
      const cfgMatch = rawCfg.match(/^\s*export\s+JWEBGEN_SERVER_TARGET="?([a-zA-Z0-9_-]+)"?\s*$/m);
      const cfgTarget = String(cfgMatch?.[1] || '').toLowerCase();
      if (cfgTarget === 'wildfly') return 'wildfly';
      if (cfgTarget === 'tomcat') return 'tomcat';
    } catch {
      // ignore and fallback to script parsing
    }
  }

  const scriptsDir = jwebgenScriptsDir(projectRoot);
  const devMjs = path.join(scriptsDir, 'dev.mjs');
  const devPath = path.join(scriptsDir, 'dev.sh');
  // If only node scripts exist, default to tomcat until deploy adapters land.
  if (existsSync(devMjs) && !existsSync(devPath)) return 'tomcat';
  if (!existsSync(devPath)) return 'tomcat';
  try {
    const raw = readFileSync(devPath, 'utf8');
    const exportMatch = raw.match(/^\s*export\s+JWEBGEN_SERVER_TARGET="?([a-zA-Z0-9_-]+)"?\s*$/m);
    const fallbackMatch = raw.match(/JWEBGEN_SERVER_TARGET:-([a-zA-Z0-9_-]+)/);
    const target = String(exportMatch?.[1] || fallbackMatch?.[1] || '').trim().toLowerCase();
    return target === 'wildfly' ? 'wildfly' : 'tomcat';
  } catch {
    return 'tomcat';
  }
}

/** Same output as `jwebgen --help` / empty argv (see `formatFlagsHelp`). */
export function showHelp() {
  console.log(formatFlagsHelp({ appName: 'jwebgen' }));
}

export function printUnknownCommandAndExit(command) {
  console.log(pc.yellow(`Unknown command: ${command}`));
  showHelp();
  process.exit(1);
}
