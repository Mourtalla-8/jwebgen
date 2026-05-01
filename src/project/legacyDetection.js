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
    issues.push(`legacy script detected: ${legacyDeployScript} without ${canonicalDeployScript}`);
  }

  if (existsSync(watchPath)) {
    try {
      const watch = await readFile(watchPath, 'utf8');
      if (watch.includes(`runScript('${legacyDeployScript}')`)) {
        issues.push(`watch.sh still references ${legacyDeployScript}`);
      }
      if (watch.includes('const cmd = [') && watch.includes('$1=="LISTEN" && $4 ~ /:')) {
        issues.push('watch.sh contains a historical quoting pattern that may be invalid');
      }
      if (watch.includes('[Qq]|[Nn])')) {
        issues.push('watch.sh contains an ambiguous legacy prompt ([Nn] also quits)');
      }
    } catch {
      issues.push('unable to read .jwebgen/scripts/watch.sh for validation');
    }
  }
  return issues;
}

