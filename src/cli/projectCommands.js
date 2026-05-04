import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import { jwebgenConfigPath, jwebgenMetaDir, jwebgenScriptsDir } from '../project/jwebgenLayout.js';
import { readJwebgenExports } from '../project/jwebgenRc.js';

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

  const cfg = readJwebgenExports(projectRoot);
  const envTarget = String(process.env.JWEBGEN_SERVER_TARGET || '').trim();
  let serverTarget = envTarget === 'tomcat' || envTarget === 'wildfly' ? envTarget : '';
  if (!serverTarget) {
    const cfgTarget = String(cfg.JWEBGEN_SERVER_TARGET || '').trim();
    if (cfgTarget === 'tomcat' || cfgTarget === 'wildfly') serverTarget = cfgTarget;
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

  const appName = await readAppNameFromPom(projectRoot, path.basename(projectRoot));
  if (serverTarget === 'tomcat') {
    const tomcatHome = String(process.env.TOMCAT_HOME || process.env.TOMCAT10 || cfg.TOMCAT_HOME || cfg.TOMCAT10 || '').trim();
    const defaultHome = process.platform === 'win32' ? '' : '/var/lib/tomcat10';
    const home = tomcatHome || defaultHome;
    if (!home) {
      console.log(pc.yellow('Deployment: unknown (configure TOMCAT_HOME or .jwebgen/.jwebgenrc)'));
      return;
    }
    const warPath = path.join(home, 'webapps', `${appName}.war`);
    const explodedPath = path.join(home, 'webapps', appName);
    if (existsSync(warPath) || existsSync(explodedPath)) {
      console.log(pc.green('Deployment: present'));
      console.log(pc.cyan(`URL : http://localhost:8080/${appName}/`));
    } else {
      console.log(pc.yellow('Deployment: absent'));
    }
    return;
  }

  const defaultWildflyHome = process.platform === 'win32' ? '' : '/opt/wildfly';
  const wildflyHome = String(process.env.WILDFLY_HOME || cfg.WILDFLY_HOME || defaultWildflyHome).trim();
  const deployments = String(
    process.env.WILDFLY_DEPLOYMENTS || cfg.WILDFLY_DEPLOYMENTS || (wildflyHome ? path.join(wildflyHome, 'standalone', 'deployments') : '')
  ).trim();
  if (!deployments) {
    console.log(pc.yellow('Deployment: unknown (configure WILDFLY_DEPLOYMENTS or WILDFLY_HOME in env/.jwebgenrc)'));
    return;
  }
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
  makeLiveReloadClientScript,
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
  const appName = await readAppNameFromPom(projectRoot, path.basename(projectRoot));
  const configuredTarget = await readConfiguredServerTarget(projectRoot);
  const legacyScriptTarget = await detectExplicitServerTargetFromDevScript(projectRoot);
  const detectedTarget = detectServerTargetFromProject(projectRoot);
  const serverTarget =
    configuredTarget
    || legacyScriptTarget
    || (detectedTarget === 'wildfly' ? 'wildfly' : '');

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
  await writeFileSafe(path.join(projectRoot, '.jwebgen', 'live-reload.js'), makeLiveReloadClientScript());

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
  if (!effectiveTarget) return;
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

async function readConfiguredServerTarget(projectRoot) {
  const cfgPath = jwebgenConfigPath(projectRoot);
  if (!existsSync(cfgPath)) return '';
  try {
    return extractServerTarget(await readFile(cfgPath, 'utf8'));
  } catch {
    return '';
  }
}

async function readAppNameFromPom(projectRoot, fallback) {
  const pomPath = path.join(projectRoot, 'pom.xml');
  if (!existsSync(pomPath)) return fallback;
  try {
    const pom = await readFile(pomPath, 'utf8');
    // Remove the <parent>...</parent> block to avoid picking up parent artifactId
    const pomWithoutParent = pom.replace(/<parent>\s*[\s\S]*?<\/parent>/gi, '');
    // Drop <profiles> so build/finalName in a profile is not mistaken for the main <build>
    const pomForBuild = pomWithoutParent.replace(/<profiles>\s*[\s\S]*?<\/profiles>/gi, '');

    // First try to find finalName within the top-level <build> block
    const buildBlockMatch = pomForBuild.match(/<build>\s*([\s\S]*?)<\/build>/i);
    if (buildBlockMatch?.[1]) {
      const buildContent = buildBlockMatch[1];
      const finalNameMatch = buildContent.match(/<finalName>\s*([^<\s][^<]*)\s*<\/finalName>/i);
      if (finalNameMatch?.[1]) return String(finalNameMatch[1]).trim();
    }

    // Fallback to project artifactId (parent + profiles stripped)
    const artifactMatch = pomForBuild.match(/<artifactId>\s*([^<\s][^<]*)\s*<\/artifactId>/i);
    if (artifactMatch?.[1]) return String(artifactMatch[1]).trim();
  } catch {
    return fallback;
  }
  return fallback;
}

async function detectExplicitServerTargetFromDevScript(projectRoot) {
  const devPath = path.join(jwebgenScriptsDir(projectRoot), 'dev.sh');
  if (!existsSync(devPath)) return '';
  try {
    const raw = await readFile(devPath, 'utf8');
    const direct = raw.match(/^\s*export\s+JWEBGEN_SERVER_TARGET="?([a-zA-Z0-9_-]+)"?\s*$/m);
    const fallback = raw.match(/JWEBGEN_SERVER_TARGET:-([a-zA-Z0-9_-]+)/);
    const target = String(direct?.[1] || fallback?.[1] || '').toLowerCase();
    if (target === 'tomcat' || target === 'wildfly') return target;
    return '';
  } catch {
    return '';
  }
}

function extractServerTarget(raw) {
  const m = String(raw).match(/JWEBGEN_SERVER_TARGET\s*=\s*"?([a-zA-Z0-9_-]+)"?/);
  const target = String(m?.[1] || '').trim();
  if (target === 'tomcat' || target === 'wildfly') return target;
  return '';
}
