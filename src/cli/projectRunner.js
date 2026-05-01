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
    console.error(pc.red('No jwebgen project detected in the current directory or its parents.'));
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
      console.error(pc.red('Project detected as legacy/incompatible with this jwebgen version.'));
      for (const issue of issues) console.error(pc.yellow(`- ${issue}`));
      console.error(pc.cyan('Run first: jwebgen --migrate'));
      process.exit(1);
    }
  }

  if (!existsSync(scriptPath)) {
    console.error(pc.red(`Script ${scriptName} was not found in ${scriptsDir}.`));
    process.exit(1);
  }

  try {
    await execa(scriptPath, args, { cwd: projectRoot, stdio: 'inherit', env });
  } catch (error) {
    const msg = error?.shortMessage || error?.message || String(error);
    console.error(pc.red(`${scriptName} failed: ${msg}`));
    error.jwebgenHandled = true;
    throw error;
  }
}
