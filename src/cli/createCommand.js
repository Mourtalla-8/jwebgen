import pc from 'picocolors';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execa } from 'execa';

export async function runCreateCommand(deps) {
  const {
    intro,
    outro,
    text,
    select,
    confirm,
    spinner,
    isCancel,
    note,
    appName,
    serverOptions,
    validateNonEmpty,
    validateLocation,
    slugifyArtifactId,
    validateArtifactId,
    normalizePackageCandidate,
    validateQualifiedName,
    sanitizePackage,
    artifactPackagePart,
    expandHome,
    detectJavaCompiler,
    installHint,
    evaluateJavaCompatibility,
    packageToPath,
    writeFileSafe,
    makeDevMd,
    makeBuildScript,
    makeDeployServerScript,
    makeDeploySelectorScript,
    makeDevScript,
    makeWatchScript,
    makeAddServletScript,
    makeExecutable,
    ensureBuildTools,
    gitignore,
    helloServlet,
    indexJsp,
    pomXml,
    readmeMd,
    tomcatContextXmlDev,
    webXml,
    cli = {}
  } = deps;

  function exitOnCancel(value) {
    if (isCancel(value)) {
      console.log(pc.yellow('Annulé.'));
      process.exit(0);
    }
    return value;
  }

  async function askText(
    message,
    {
      placeholder = '',
      defaultValue = '',
      transform = (value) => String(value).trim(),
      validate = () => null
    } = {}
  ) {
    while (true) {
      const raw = exitOnCancel(await text({ message, placeholder, defaultValue }));
      const value = transform(raw);
      const error = validate(value, raw);
      if (!error) return value;
      console.log(pc.red(error));
    }
  }

  intro(`${pc.cyan(appName)} — générateur Java Web (Servlet/JSP)`);

  const cliProjectName = String(cli?.projectName || '').trim();
  const cliYes = Boolean(cli?.yes);
  const cliServerTarget = cli?.serverTarget === 'wildfly' ? 'wildfly' : cli?.serverTarget === 'tomcat' ? 'tomcat' : null;

  const projectName = cliYes
    ? cliProjectName
    : await askText('Nom du projet', {
        placeholder: 'mon-webapp',
        defaultValue: cliProjectName || 'mon-webapp',
        transform: (value) => String(value).trim(),
        validate: (value) => validateNonEmpty(value, 'Nom du projet')
      });

  const defaultArtifactId = slugifyArtifactId(projectName) || 'mon-webapp';
  const artifactId = cliYes
    ? defaultArtifactId
    : await askText('Identifiant Maven (artifactId)', {
        placeholder: defaultArtifactId,
        defaultValue: defaultArtifactId,
        transform: slugifyArtifactId,
        validate: (value) => validateArtifactId(value)
      });
  const deployedAppName = artifactId;

  const groupId = cliYes
    ? 'com.exo'
    : await askText('GroupId', {
        placeholder: 'com.exo',
        defaultValue: 'com.exo',
        transform: normalizePackageCandidate,
        validate: (value) => validateQualifiedName(value, { minSegments: 2, label: 'GroupId' })
      });

  const defaultPackage = sanitizePackage(`${groupId}.${artifactPackagePart(artifactId)}`) || 'com.exo.app';
  const basePackage = cliYes
    ? defaultPackage
    : await askText('Package de base', {
        placeholder: defaultPackage,
        defaultValue: defaultPackage,
        transform: sanitizePackage,
        validate: (value) => validateQualifiedName(value, { minSegments: 2, label: 'Package de base' })
      });

  const defaultLocation = path.join(process.cwd(), artifactId);
  const location = cliYes
    ? path.resolve(expandHome(defaultLocation))
    : await askText('Emplacement du projet', {
        placeholder: defaultLocation,
        defaultValue: defaultLocation,
        transform: (value) => path.resolve(expandHome(value)),
        validate: (value) => validateLocation(value)
      });
  const targetDir = location;

  const serverTarget = cliServerTarget || (cliYes ? 'tomcat' : exitOnCancel(await select({ message: 'Serveur cible', options: serverOptions })));
  const javaDetection = detectJavaCompiler();

  if (!javaDetection.present) {
    console.log(pc.red('Java (JDK) est absent ou `javac` est introuvable.'));
    console.log(pc.yellow(`Installation requise : ${installHint('java')}`));
    console.log(pc.yellow('La création est arrêtée tant qu’un JDK compatible n’est pas disponible.'));
    process.exit(1);
  }

  const javaCompatibility = evaluateJavaCompatibility(javaDetection.majorRelease);
  if (javaCompatibility.status !== 'ok') {
    console.log(pc.red(`Java détecté mais non utilisable pour ce projet : ${javaDetection.display}`));
    console.log(pc.red(javaCompatibility.reason));
    console.log(pc.yellow(`Mise à niveau requise : ${installHint('java')}`));
    console.log(pc.yellow('La création est arrêtée tant qu’un JDK compatible n’est pas disponible.'));
    process.exit(1);
  }

  const javaRelease = javaDetection.majorRelease;
  const addServlet = cliYes ? true : exitOnCancel(await confirm({ message: 'Créer une servlet d’exemple /hello ?', initialValue: true }));
  const addJsp = cliYes ? true : exitOnCancel(await confirm({ message: 'Créer une page JSP index.jsp ?', initialValue: true }));
  const addWebXml = cliYes ? false : exitOnCancel(await confirm({ message: 'Créer un web.xml ?', initialValue: false }));
  const addGitignore = cliYes ? true : exitOnCancel(await confirm({ message: 'Créer un .gitignore ?', initialValue: true }));
  const buildNow = cliYes ? false : exitOnCancel(await confirm({ message: 'Compiler le projet après création ?', initialValue: false }));

  if (existsSync(targetDir)) {
    console.log(pc.red(`Le dossier existe déjà : ${targetDir}`));
    process.exit(1);
  }

  note(
    [
      `Projet : ${projectName}`,
      `artifactId : ${artifactId}`,
      `Nom déployé : ${deployedAppName}`,
      `Emplacement : ${targetDir}`,
      `groupId : ${groupId}`,
      `package : ${basePackage}`,
      `serveur : ${serverTarget}`,
      `Java détecté : ${javaDetection.display}`,
      `Version Java : ${javaRelease}`,
      `Servlet : ${addServlet ? 'oui' : 'non'}`,
      `JSP : ${addJsp ? 'oui' : 'non'}`,
      `web.xml : ${addWebXml ? 'oui' : 'non'}`,
      `Build : ${buildNow ? 'oui' : 'non'}`,
      `URL dev : http://localhost:8080/${deployedAppName}/`
    ].join('\n'),
    'Résumé'
  );

  if (!cliYes) {
    const shouldCreate = exitOnCancel(await confirm({ message: `Créer le projet ici ?\n${targetDir}`, initialValue: true }));
    if (!shouldCreate) {
      console.log(pc.yellow('Annulé. Aucun fichier n’a été créé.'));
      process.exit(0);
    }
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-'));
  const workDir = path.join(tempRoot, artifactId);
  const s = spinner();
  s.start('Génération...');

  try {
    const pkgPath = packageToPath(basePackage);
    await mkdir(path.join(workDir, 'src/main/java', pkgPath), { recursive: true });
    await mkdir(path.join(workDir, 'src/main/webapp/WEB-INF'), { recursive: true });
    await mkdir(path.join(workDir, 'scripts'), { recursive: true });

    await writeFileSafe(
      path.join(workDir, 'pom.xml'),
      pomXml({
        projectName,
        groupId,
        artifactId,
        javaRelease,
        finalName: deployedAppName,
        appName: deployedAppName,
        contextPath: deployedAppName
      })
    );

    if (addServlet) await writeFileSafe(path.join(workDir, 'src/main/java', pkgPath, 'HelloServlet.java'), helloServlet({ basePackage }));
    if (addJsp) {
      await writeFileSafe(path.join(workDir, 'src/main/webapp', 'index.jsp'), indexJsp({ projectName, artifactId, hasServlet: addServlet }));
    }
    if (serverTarget === 'tomcat') await writeFileSafe(path.join(workDir, 'src/main/webapp/META-INF', 'context.xml'), tomcatContextXmlDev());
    if (addWebXml) await writeFileSafe(path.join(workDir, 'src/main/webapp/WEB-INF', 'web.xml'), webXml({ projectName }));
    if (addGitignore) await writeFileSafe(path.join(workDir, '.gitignore'), gitignore());

    await writeFileSafe(
      path.join(workDir, 'README.md'),
      readmeMd({
        projectName,
        artifactId,
        groupId,
        basePackage,
        location: targetDir,
        stackMode: 'modern',
        serverTarget,
        javaRelease,
        hasServlet: addServlet,
        hasJsp: addJsp,
        appName: deployedAppName,
        contextPath: deployedAppName
      })
    );
    await writeFileSafe(path.join(workDir, 'DEV.md'), makeDevMd({ appName: deployedAppName, serverTarget }));
    await writeFileSafe(path.join(workDir, 'scripts/build.sh'), makeBuildScript());
    await writeFileSafe(path.join(workDir, 'scripts/deploy.sh'), makeDeploySelectorScript());
    await writeFileSafe(
      path.join(workDir, 'scripts/deploy-tomcat.sh'),
      makeDeployServerScript({ appName: deployedAppName, serverTarget: 'tomcat' })
    );
    await writeFileSafe(
      path.join(workDir, 'scripts/deploy-wildfly.sh'),
      makeDeployServerScript({ appName: deployedAppName, serverTarget: 'wildfly' })
    );
    await writeFileSafe(path.join(workDir, 'scripts/dev.sh'), makeDevScript({ serverTarget }));
    await writeFileSafe(path.join(workDir, 'scripts/watch.sh'), makeWatchScript());
    if (addServlet) await writeFileSafe(path.join(workDir, 'scripts/add-servlet.sh'), makeAddServletScript({ basePackage }));
    await writeFileSafe(path.join(workDir, '.jwebgenrc'), `export JWEBGEN_SERVER_TARGET="${serverTarget}"\n`);

    const scriptFiles = [
      'scripts/build.sh',
      'scripts/deploy.sh',
      'scripts/deploy-tomcat.sh',
      'scripts/deploy-wildfly.sh',
      'scripts/dev.sh',
      'scripts/watch.sh',
      addServlet ? 'scripts/add-servlet.sh' : null
    ].filter(Boolean);
    for (const relativePath of scriptFiles) await makeExecutable(path.join(workDir, relativePath));
    await mkdir(path.dirname(targetDir), { recursive: true });
    await cp(workDir, targetDir, { recursive: true, force: true });
    for (const relativePath of scriptFiles) await makeExecutable(path.join(targetDir, relativePath));
    s.stop('Terminé.');
  } catch (error) {
    s.stop('Génération interrompue.');
    throw error;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(pc.green(`\n✅ Projet créé : ${targetDir}`));
  if (buildNow) {
    const { javaOk, mavenOk } = await ensureBuildTools();
    if (!javaOk) console.log(pc.yellow(`Java introuvable. ${installHint('java')}`));
    if (!mavenOk) console.log(pc.yellow(`Maven introuvable. ${installHint('maven')}`));
    if (javaOk && mavenOk) {
      const build = spinner();
      build.start('Build Maven...');
      try {
        await execa('mvn', ['clean', 'package'], { cwd: targetDir, stdio: 'inherit' });
        build.stop('Build OK');
      } catch {
        build.stop('Build échoué.');
        console.error(pc.red('Le build Maven a échoué.'));
        process.exit(1);
      }
    } else {
      console.log(pc.yellow('Build ignoré tant que Java ou Maven manque.'));
    }
  }

  console.log(pc.cyan('\nDéveloppement rapide :'));
  console.log(pc.cyan('- ./scripts/build.sh'));
  console.log(pc.cyan('- ./scripts/deploy.sh'));
  console.log(pc.cyan('- ./scripts/dev.sh'));
  console.log(pc.cyan('- ./scripts/watch.sh'));
  if (addServlet) console.log(pc.cyan('- jwebgen servlet HelloServlet'));
  outro(pc.cyan('Terminé.'));
}
