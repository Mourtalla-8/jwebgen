import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { jwebgenScriptsDir } from '../project/jwebgenLayout.js';

export async function runProjectScript(scriptName, args = [], options = {}, deps) {
  const {
    findProjectRoot,
    detectLegacyProjectIssues,
    canonicalDeployScript,
    legacyDeployScript
  } = deps;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red('Aucun projet jwebgen détecté dans le dossier courant ou ses parents.'));
    process.exit(1);
  }

  const scriptsDir = jwebgenScriptsDir(projectRoot);
  const scriptPath = path.join(scriptsDir, scriptName);
  const env = { ...process.env, ...(options.env || {}) };
  if (options.verbose !== undefined) env.JWEBGEN_VERBOSE = options.verbose ? '1' : '0';

  if (scriptName === 'dev.sh' || scriptName === 'watch.sh' || scriptName === canonicalDeployScript) {
    const issues = await detectLegacyProjectIssues(projectRoot, {
      canonicalDeployScript,
      legacyDeployScript
    });
    if (issues.length > 0) {
      console.error(pc.red('Projet détecté comme legacy/incompatible avec cette version de jwebgen.'));
      for (const issue of issues) console.error(pc.yellow(`- ${issue}`));
      console.error(pc.cyan('Exécute d\'abord: jwebgen --migrate'));
      process.exit(1);
    }
  }

  if (!existsSync(scriptPath)) {
    console.error(pc.red(`Le script ${scriptName} est introuvable dans ${scriptsDir}.`));
    process.exit(1);
  }

  try {
    await execa(scriptPath, args, { cwd: projectRoot, stdio: 'inherit', env });
  } catch (error) {
    const msg = error?.shortMessage || error?.message || String(error);
    console.error(pc.red(`Échec de ${scriptName}: ${msg}`));
    error.jwebgenHandled = true;
    throw error;
  }
}
