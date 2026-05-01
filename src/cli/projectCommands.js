import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import { jwebgenConfigPath, jwebgenMetaDir, jwebgenScriptsDir } from '../project/jwebgenLayout.js';

export async function runClean({ findProjectRoot }) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red('No jwebgen project detected.'));
    process.exit(1);
  }

  const targetDir = path.join(projectRoot, 'target');
  if (!existsSync(targetDir)) {
    console.log(pc.yellow('The target/ directory does not exist.'));
    return;
  }

  console.log(pc.cyan(`Removing ${targetDir}...`));
  await rm(targetDir, { recursive: true, force: true });
  console.log(pc.green('Cleaned.'));
}

export async function showStatus({ findProjectRoot }) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.log(pc.red('No jwebgen project detected.'));
    return;
  }

  console.log(pc.cyan(`Project: ${path.basename(projectRoot)}`));
  console.log(pc.cyan(`Root: ${projectRoot}`));

  let serverTarget = '';
  const cfgPath = jwebgenConfigPath(projectRoot);
  if (existsSync(cfgPath)) {
    try {
      const raw = await readFile(cfgPath, 'utf8');
      const m = raw.match(/JWEBGEN_SERVER_TARGET\s*=\s*"?([a-zA-Z0-9_-]+)"?/);
      serverTarget = String(m?.[1] || '').trim();
    } catch {
      // ignore
    }
  }
  if (!serverTarget) {
    const envTarget = String(process.env.JWEBGEN_SERVER_TARGET || '').trim();
    if (envTarget === 'tomcat' || envTarget === 'wildfly') {
      serverTarget = envTarget;
    }
  }
  const hasConfiguredServer = serverTarget === 'tomcat' || serverTarget === 'wildfly';
  if (!hasConfiguredServer) {
    serverTarget = 'unset';
  }
  console.log(pc.cyan(`Server: ${serverTarget}`));
  if (!hasConfiguredServer) {
    console.log(pc.yellow('Server is not configured yet (use jwebgen --dev or --deploy to choose one).'));
    console.log(pc.yellow('Deployment: unknown (waiting for server selection)'));
    return;
  }

  try {
    if (serverTarget === 'tomcat') {
      const { stdout } = await execa('pgrep', ['-f', 'tomcat'], { timeout: 2000 });
      if (stdout.trim()) {
        console.log(pc.green('Tomcat: running'));
      } else {
        console.log(pc.yellow('Tomcat: stopped'));
        console.log(pc.yellow('To start Tomcat: sudo systemctl start tomcat10 (or equivalent)'));
      }
    } else {
      const { stdout } = await execa('pgrep', ['-f', 'standalone.sh|org.jboss.as.standalone'], { timeout: 2000 });
      if (stdout.trim()) {
        console.log(pc.green('WildFly: running'));
      } else {
        console.log(pc.yellow('WildFly: stopped'));
        console.log(pc.yellow('To start WildFly: systemctl start wildfly (if configured) or standalone.sh'));
      }
    }
  } catch {
    console.log(pc.yellow('Server: unknown status (pgrep unavailable)'));
  }

  const appName = path.basename(projectRoot);
  if (serverTarget === 'tomcat') {
    const tomcatDir = process.env.TOMCAT10 || '/var/lib/tomcat10';
    const warPath = path.join(tomcatDir, 'webapps', `${appName}.war`);
    const explodedPath = path.join(tomcatDir, 'webapps', appName);
    if (existsSync(warPath) || existsSync(explodedPath)) {
      console.log(pc.green('Deployment: present'));
      console.log(pc.cyan(`URL : http://localhost:8080/${appName}/`));
    } else {
      console.log(pc.yellow('Deployment: absent'));
    }
    return;
  }

  const wildflyHome = process.env.WILDFLY_HOME || '/opt/wildfly';
  const deployments = process.env.WILDFLY_DEPLOYMENTS || path.join(wildflyHome, 'standalone', 'deployments');
  const deployed = path.join(deployments, `${appName}.war`);
  if (existsSync(deployed)) {
    console.log(pc.green('Deployment: present'));
    console.log(pc.cyan(`URL : http://localhost:8080/${appName}/`));
  } else {
    console.log(pc.yellow('Deployment: absent'));
  }
}

export async function runMigrate({
  findProjectRoot,
  detectServerTargetFromProject,
  writeFileSafe,
  makeBuildScript,
  makeDeployServerScript,
  makeDeploySelectorScript,
  makeDevScript,
  makeWatchScript,
  makeNodeBuildScript,
  makeNodeDeployScript,
  makeNodeDevScript,
  makeNodeWatchScript,
  makeAddServletScript,
  makeExecutable,
  legacyDeployScript
}) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red('No jwebgen project detected.'));
    process.exit(1);
  }

  const scriptsDir = jwebgenScriptsDir(projectRoot);
  await mkdir(scriptsDir, { recursive: true });
  const appName = path.basename(projectRoot);
  const serverTarget = detectServerTargetFromProject(projectRoot);

  await writeFileSafe(path.join(scriptsDir, 'build.sh'), makeBuildScript());
  await writeFileSafe(path.join(scriptsDir, 'deploy.sh'), makeDeploySelectorScript());
  await writeFileSafe(
    path.join(scriptsDir, 'deploy-tomcat.sh'),
    makeDeployServerScript({ appName, serverTarget: 'tomcat' })
  );
  await writeFileSafe(
    path.join(scriptsDir, 'deploy-wildfly.sh'),
    makeDeployServerScript({ appName, serverTarget: 'wildfly' })
  );
  await writeFileSafe(path.join(scriptsDir, 'dev.sh'), makeDevScript({ serverTarget }));
  await writeFileSafe(path.join(scriptsDir, 'watch.sh'), makeWatchScript());

  // Cross-platform Node entrypoints (preferred by the CLI when present).
  if (typeof makeNodeBuildScript === 'function') {
    await writeFileSafe(path.join(scriptsDir, 'build.mjs'), makeNodeBuildScript());
  }
  if (typeof makeNodeDeployScript === 'function') {
    await writeFileSafe(path.join(scriptsDir, 'deploy.mjs'), makeNodeDeployScript());
  }
  if (typeof makeNodeDevScript === 'function') {
    await writeFileSafe(path.join(scriptsDir, 'dev.mjs'), makeNodeDevScript());
  }
  if (typeof makeNodeWatchScript === 'function') {
    await writeFileSafe(path.join(scriptsDir, 'watch.mjs'), makeNodeWatchScript());
  }
  const basePackage = await inferBasePackage(projectRoot, appName);
  await writeFileSafe(path.join(scriptsDir, 'add-servlet.sh'), makeAddServletScript({ basePackage }));
  await writeProjectConfigServerTarget(projectRoot, serverTarget);

  const reservedScriptNames = new Set([
    'deploy.sh',
    'deploy-tomcat.sh',
    'deploy-wildfly.sh'
  ]);
  if (!reservedScriptNames.has(String(legacyDeployScript || ''))) {
    const legacyDeployPath = path.join(scriptsDir, legacyDeployScript);
    if (existsSync(legacyDeployPath)) await rm(legacyDeployPath, { force: true });
  }

  await makeExecutable(path.join(scriptsDir, 'build.sh'));
  await makeExecutable(path.join(scriptsDir, 'deploy.sh'));
  await makeExecutable(path.join(scriptsDir, 'deploy-tomcat.sh'));
  await makeExecutable(path.join(scriptsDir, 'deploy-wildfly.sh'));
  await makeExecutable(path.join(scriptsDir, 'dev.sh'));
  await makeExecutable(path.join(scriptsDir, 'watch.sh'));
  await makeExecutable(path.join(scriptsDir, 'add-servlet.sh'));

  if (typeof makeNodeBuildScript === 'function') await makeExecutable(path.join(scriptsDir, 'build.mjs'));
  if (typeof makeNodeDeployScript === 'function') await makeExecutable(path.join(scriptsDir, 'deploy.mjs'));
  if (typeof makeNodeDevScript === 'function') await makeExecutable(path.join(scriptsDir, 'dev.mjs'));
  if (typeof makeNodeWatchScript === 'function') await makeExecutable(path.join(scriptsDir, 'watch.mjs'));

  console.log(pc.green('Migration complete: scripts regenerated to current format.'));
  console.log(pc.cyan('You can run again: jwebgen --dev'));
}

async function inferBasePackage(projectRoot, appName) {
  const javaRoot = path.join(projectRoot, 'src', 'main', 'java');
  const fallback = `com.exo.${String(appName).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'app'}`;
  if (!existsSync(javaRoot)) return fallback;

  const stack = [javaRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.java')) continue;
      const content = await readFile(fullPath, 'utf8');
      const match = content.match(/^\s*package\s+([a-zA-Z_][\w.]*)\s*;/m);
      if (match?.[1]) return match[1];
    }
  }
  return fallback;
}

async function writeProjectConfigServerTarget(projectRoot, detectedTarget) {
  await mkdir(jwebgenMetaDir(projectRoot), { recursive: true });
  const cfgPath = jwebgenConfigPath(projectRoot);
  let raw = '';
  if (existsSync(cfgPath)) {
    try {
      raw = await readFile(cfgPath, 'utf8');
    } catch {
      raw = '';
    }
  }

  const existingTarget = extractServerTarget(raw);
  const effectiveTarget = existingTarget || detectedTarget;
  const line = `export JWEBGEN_SERVER_TARGET="${effectiveTarget}"`;
  const hasServerLine = /^export\s+JWEBGEN_SERVER_TARGET=.*$/m.test(raw);

  let nextRaw;
  if (hasServerLine) {
    nextRaw = raw.replace(/^export\s+JWEBGEN_SERVER_TARGET=.*$/m, line);
  } else if (raw.trim().length === 0) {
    nextRaw = `${line}\n`;
  } else {
    nextRaw = raw.endsWith('\n') ? `${raw}${line}\n` : `${raw}\n${line}\n`;
  }

  await writeFile(cfgPath, nextRaw, 'utf8');
}

function extractServerTarget(raw) {
  const m = String(raw).match(/JWEBGEN_SERVER_TARGET\s*=\s*"?([a-zA-Z0-9_-]+)"?/);
  const target = String(m?.[1] || '').trim();
  if (target === 'tomcat' || target === 'wildfly') return target;
  return '';
}
