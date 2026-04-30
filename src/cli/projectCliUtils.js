import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { jwebgenScriptsDir } from '../project/jwebgenLayout.js';

export function findProjectRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    if (
      existsSync(path.join(dir, 'pom.xml')) &&
      existsSync(path.join(jwebgenScriptsDir(dir), 'watch.sh'))
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
  const devPath = path.join(jwebgenScriptsDir(projectRoot), 'dev.sh');
  if (!existsSync(devPath)) return 'tomcat';
  try {
    const raw = spawnSync(
      'bash',
      ['-lc', `sed -n "s/^export JWEBGEN_SERVER_TARGET=\\\"\\([^\\\"]*\\)\\\"/\\1/p" "${devPath}" | head -n 1`],
      { encoding: 'utf8' }
    );
    const target = String(raw?.stdout || '').trim();
    return target === 'wildfly' ? 'wildfly' : 'tomcat';
  } catch {
    return 'tomcat';
  }
}

export function showHelp() {
  console.log(`
Usage: jwebgen [option]

Options:

--help, -h
  This help message.

--status
  Show project status.

--dev
  Start dev loop in current project.

--watch
  Alias for --dev.

--build
  Run project build script.

--deploy
  Run project deploy script.

--clean
  Remove target/ in current project.

--clean --deploy
  Clean deployed app from server for current project only.

--migrate, -m
  Upgrade a legacy jwebgen project.

--servlet <Name>
  Create a servlet (class name auto-normalized).

--new, -n <projectName>
--create, -c <projectName>
  Create a new project (interactive by default).

--yes, -y
  Non-interactive mode for project creation (requires <projectName>).

--tomcat, -t / --wildfly, -w
  Choose server target.
`);
}

export function printUnknownCommandAndExit(command) {
  console.log(pc.yellow(`Commande inconnue : ${command}`));
  showHelp();
  process.exit(1);
}
