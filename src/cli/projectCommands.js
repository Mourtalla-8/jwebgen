import pc from 'picocolors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
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

  try {
    const { stdout } = await execa('pgrep', ['-f', 'tomcat'], { timeout: 2000 });
    if (stdout.trim()) {
      console.log(pc.green('Tomcat : en cours d\'exécution'));
    } else {
      console.log(pc.yellow('Tomcat : arrêté'));
      console.log(pc.yellow('Pour démarrer Tomcat : sudo systemctl start tomcat10 (ou équivalent)'));
    }
  } catch {
    console.log(pc.yellow('Tomcat : statut inconnu (pgrep non disponible)'));
  }

  const tomcatDir = process.env.TOMCAT10 || '/var/lib/tomcat10';
  const appName = path.basename(projectRoot);
  const warPath = path.join(tomcatDir, 'webapps', `${appName}.war`);
  const explodedPath = path.join(tomcatDir, 'webapps', appName);

  if (existsSync(warPath) || existsSync(explodedPath)) {
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
  makeDevScript,
  makeWatchScript,
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
  await writeFileSafe(
    path.join(projectRoot, 'scripts/deploy.sh'),
    makeDeployServerScript({ appName, serverTarget })
  );
  await writeFileSafe(path.join(projectRoot, 'scripts/dev.sh'), makeDevScript({ serverTarget }));
  await writeFileSafe(path.join(projectRoot, 'scripts/watch.sh'), makeWatchScript());

  const legacyDeployPath = path.join(projectRoot, 'scripts', legacyDeployScript);
  if (existsSync(legacyDeployPath)) await rm(legacyDeployPath, { force: true });

  await makeExecutable(path.join(projectRoot, 'scripts/build.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/deploy.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/dev.sh'));
  await makeExecutable(path.join(projectRoot, 'scripts/watch.sh'));

  console.log(pc.green('Migration terminée: scripts régénérés au format courant.'));
  console.log(pc.cyan('Tu peux relancer: jwebgen dev'));
}
