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
  const candidateNode =
    scriptName.endsWith('.sh') ? scriptName.replace(/\.sh$/, '.mjs') : scriptName.endsWith('.mjs') ? scriptName : null;
  const nodePath = candidateNode ? path.join(scriptsDir, candidateNode) : '';
  const scriptPath = candidateNode && existsSync(nodePath) ? nodePath : path.join(scriptsDir, scriptName);
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

  const isCleanupDeploy =
    scriptName === canonicalDeployScript && Array.isArray(args) && args.includes('--cleanup-dev');
  /** Pipe stderr so deploy_sudo_required marker can be detected on failure (stdio inherit drops it). */
  const stdio = isCleanupDeploy ? ['inherit', 'inherit', 'pipe'] : 'inherit';

  try {
    if (scriptPath.endsWith('.mjs')) {
      const isDeployMjs = scriptName === canonicalDeployScript && candidateNode === 'deploy.mjs';
      if (isDeployMjs) {
        const subprocess = execa(process.execPath, [scriptPath, ...args], {
          cwd: projectRoot,
          stdio: ['inherit', 'inherit', 'pipe'],
          env
        });
        subprocess.stderr.pipe(process.stderr);
        await subprocess;
      } else {
        await execa(process.execPath, [scriptPath, ...args], { cwd: projectRoot, stdio: 'inherit', env });
      }
    } else {
      await execa(scriptPath, args, { cwd: projectRoot, stdio, env });
    }
  } catch (error) {
    if (error?.exitCode === 130 || error?.signal === 'SIGINT') {
      throw error;
    }
    if (error?.code === 'EACCES' || String(error?.message || '').includes('EACCES')) {
      const relative = `./.jwebgen/scripts/${scriptName}`;
      console.error(pc.red(`${scriptName} failed: permission denied (${relative}).`));
      console.error(pc.yellow(`Run: chmod +x "${relative}"`));
      console.error(pc.yellow('If permissions keep failing, regenerate scripts with: jwebgen --migrate'));
      error.jwebgenHandled = true;
      throw error;
    }
    const msg = error?.shortMessage || error?.message || String(error);
    const marker = '__JWEBGEN_EVENT__ deploy_sudo_required';
    const markerPresent = [msg, error?.stderr, error?.stdout, error?.all]
      .filter(Boolean)
      .some((chunk) => String(chunk).includes(marker));
    if (isCleanupDeploy && markerPresent) {
      console.error(pc.yellow('Cleanup failed for target server directories.'));
      console.error(pc.yellow('If this is a permission issue, jwebgen will auto-retry with sudo on Linux when available.'));
      error.jwebgenHandled = true;
      throw error;
    }
    const serverDownChunks = [msg, error?.stderr, error?.stdout, error?.all].filter(Boolean).map(String);
    const serverDown = [scriptName, candidateNode]
      .filter(Boolean)
      .some((n) => /deploy/i.test(String(n)))
      && serverDownChunks.some(
        (c) => c.includes('__JWEBGEN_EVENT__ server_down') || c.includes('Selected server is installed but currently down.')
      );
    if (serverDown) {
      error.jwebgenHandled = true;
      throw error;
    }
    console.error(pc.red(`${scriptName} failed: ${msg}`));
    const rawOut = [error?.stderr, error?.stdout, error?.all]
      .filter((chunk) => chunk != null && String(chunk).trim() !== '')
      .map((chunk) => String(chunk));
    if (rawOut.length) {
      const combined = rawOut.join('\n');
      if (combined !== msg) console.error(combined);
    }
    error.jwebgenHandled = true;
    throw error;
  }
}
