import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { jwebgenScriptsDir } from './jwebgenLayout.js';

export async function detectLegacyProjectIssues(projectRoot, {
  canonicalDeployScript = 'deploy.sh',
  legacyDeployScript = 'deploy-tomcat.sh'
} = {}) {
  const issues = [];
  const scriptsDir = jwebgenScriptsDir(projectRoot);
  const deployPath = path.join(scriptsDir, canonicalDeployScript);
  const legacyDeployPath = path.join(scriptsDir, legacyDeployScript);
  const watchPath = path.join(scriptsDir, 'watch.sh');

  if (!existsSync(deployPath) && existsSync(legacyDeployPath)) {
    issues.push(`script legacy détecté: ${legacyDeployScript} sans ${canonicalDeployScript}`);
  }

  if (existsSync(watchPath)) {
    try {
      const watch = await readFile(watchPath, 'utf8');
      if (watch.includes(`runScript('${legacyDeployScript}')`)) {
        issues.push(`watch.sh référence encore ${legacyDeployScript}`);
      }
      if (watch.includes('const cmd = [') && watch.includes('$1=="LISTEN" && $4 ~ /:')) {
        issues.push('watch.sh contient un pattern de quoting historique potentiellement invalide');
      }
      if (watch.includes('[Qq]|[Nn])')) {
        issues.push("watch.sh contient un prompt ambigu legacy ([Nn] quitte aussi)");
      }
    } catch {
      issues.push('impossible de lire .jwebgen/scripts/watch.sh pour validation');
    }
  }
  return issues;
}

