import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function findProjectRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, 'pom.xml')) && existsSync(path.join(dir, 'scripts'))) return dir;
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
  const devPath = path.join(projectRoot, 'scripts', 'dev.sh');
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
Usage: jwebgen [commande] [args]

Commandes:
  create          Crée un nouveau projet interactif (par défaut)
  dev             Démarre le mode dev en boucle dans le projet courant
  build           Lance ./scripts/build.sh dans le projet courant
  deploy          Lance ./scripts/deploy.sh dans le projet courant
  migrate         Met à niveau un projet jwebgen legacy
  watch           Lance ./scripts/watch.sh dans le projet courant
  servlet         Lance ./scripts/add-servlet.sh [NomClasse]
  clean           Nettoie le dossier target/
  status          Affiche le statut du projet et de Tomcat
  help            Affiche cette aide

Options:
  --verbose, -v   Active les logs détaillés (Maven + scripts)
`);
}

export function printUnknownCommandAndExit(command) {
  console.log(pc.yellow(`Commande inconnue : ${command}`));
  showHelp();
  process.exit(1);
}
