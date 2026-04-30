import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execa } from 'execa';

export async function runClean({ findProjectRoot }) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red('Aucun projet jwebgen détecté.'));
    process.exit(1);
  }

  const targetDir = path.join(projectRoot, 'target');
  if (!existsSync(targetDir)) {
    console.log(pc.yellow('Le dossier target/ n\'existe pas.'));
    return;
  }

  console.log(pc.cyan(`Suppression de ${targetDir}...`));
  await rm(targetDir, { recursive: true, force: true });
  console.log(pc.green('Nettoyé.'));
}

export async function showStatus({ findProjectRoot }) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.log(pc.red('Aucun projet jwebgen détecté.'));
    return;
  }

  console.log(pc.cyan(`Projet : ${path.basename(projectRoot)}`));
  console.log(pc.cyan(`Racine : ${projectRoot}`));

  let serverTarget = '';
  const cfgPath = path.join(projectRoot, '.jwebgenrc');
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
  console.log(pc.cyan(`Serveur : ${serverTarget}`));
  if (!hasConfiguredServer) {
    console.log(pc.yellow('Serveur non choisi (utilise jwebgen --dev ou --deploy pour le sélectionner).'));
    console.log(pc.yellow('Déploiement : inconnu (en attente du choix serveur)'));
    return;
  }

  try {
    if (serverTarget === 'tomcat') {
      const { stdout } = await execa('pgrep', ['-f', 'tomcat'], { timeout: 2000 });
      if (stdout.trim()) {
        console.log(pc.green('Tomcat : en cours d\'exécution'));
      } else {
        console.log(pc.yellow('Tomcat : arrêté'));
        console.log(pc.yellow('Pour démarrer Tomcat : sudo systemctl start tomcat10 (ou équivalent)'));
      }
    } else {
      const { stdout } = await execa('pgrep', ['-f', 'standalone.sh|org.jboss.as.standalone'], { timeout: 2000 });
      if (stdout.trim()) {
        console.log(pc.green('WildFly : en cours d\'exécution'));
      } else {
        console.log(pc.yellow('WildFly : arrêté'));
        console.log(pc.yellow('Pour démarrer WildFly : systemctl start wildfly (si configuré) ou standalone.sh'));
      }
    }
  } catch {
    console.log(pc.yellow('Serveur : statut inconnu (pgrep non disponible)'));
  }

  const appName = path.basename(projectRoot);
  if (serverTarget === 'tomcat') {
    const tomcatDir = process.env.TOMCAT10 || '/var/lib/tomcat10';
    const warPath = path.join(tomcatDir, 'webapps', `${appName}.war`);
    const explodedPath = path.join(tomcatDir, 'webapps', appName);
    if (existsSync(warPath) || existsSync(explodedPath)) {
      console.log(pc.green('Déploiement : présent'));
      console.log(pc.cyan(`URL : http://localhost:8080/${appName}/`));
    } else {
      console.log(pc.yellow('Déploiement : absent'));
    }
    return;
  }

  const wildflyHome = process.env.WILDFLY_HOME || '/opt/wildfly';
  const deployments = process.env.WILDFLY_DEPLOYMENTS || path.join(wildflyHome, 'standalone', 'deployments');
  const deployed = path.join(deployments, `${appName}.war`);
  if (existsSync(deployed)) {
    console.log(pc.green('Déploiement : présent'));
    console.log(pc.cyan(`URL : http://localhost:8080/${appName}/`));
  } else {
    console.log(pc.yellow('Déploiement : absent'));
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
  makeAddServletScript,
  makeExecutable,
  legacyDeployScript
}) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(pc.red('Aucun projet jwebgen détecté.'));
    process.exit(1);
  }

  await mkdir(path.join(projectRoot, 'scripts'), { recursive: true });
  const appName = path.basename(projectRoot);
  const serverTarget = detectServerTargetFromProject(projectRoot);

  await writeFileSafe(path.join(projectRoot, 'scripts/build.sh'), makeBuildScript());
  await writeFileSafe(path.join(projectRoot, 'scripts/deploy.sh'), makeDeploySelectorScript());
  await writeFileSafe(
    path.join(projectRoot, 'scripts/deploy-tomcat.sh'),
    makeDeployServerScript({ appName, serverTarget: 'tomcat' })
  );
  await writeFileSafe(
    path.join(projectRoot, 'scripts/deploy-wildfly.sh'),
    makeDeployServerScript({ appName, serverTarget: 'wildfly' })
  );
  await writeFileSafe(path.join(projectRoot, 'scripts/dev.sh'), makeDevScript({ serverTarget }));
  await writeFileSafe(path.join(projectRoot, 'scripts/watch.sh'), makeWatchScript());
  const basePackage = await inferBasePackage(projectRoot, appName);
  await writeFileSafe(path.join(projectRoot, 'scripts/add-servlet.sh'), makeAddServletScript({ basePackage }));
  await writeProjectConfigServerTarget(projectRoot, serverTarget);

  const legacyDeployPath = path.join(projectRoot, 'scripts', legacyDeployScript);
  if (existsSync(legacyDeployPath)) await rm(legacyDeployPath, { force: true });

  await makeExecutable(path.join(projectRoot, 'scripts/build.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/deploy.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/deploy-tomcat.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/deploy-wildfly.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/dev.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/watch.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/add-servlet.sh'));

  console.log(pc.green('Migration terminée: scripts régénérés au format courant.'));
  console.log(pc.cyan('Tu peux relancer: jwebgen --dev'));
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
  const cfgPath = path.join(projectRoot, '.jwebgenrc');
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
