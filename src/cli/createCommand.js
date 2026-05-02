import pc from 'picocolors';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execa } from 'execa';
import { jwebgenScriptsDir } from '../project/jwebgenLayout.js';

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
    makeNodeBuildScript,
    makeNodeDeployScript,
    makeNodeDevScript,
    makeNodeWatchScript,
    makeAddServletScript,
    makeLiveReloadClientScript,
    makeExecutable,
    ensureBuildTools,
    gitignore,
    helloServlet,
    devLiveReloadFilter,
    indexJsp,
    pomXml,
    readmeMd,
    tomcatContextXmlDev,
    webXml,
    cli = {}
  } = deps;

  function exitOnCancel(value) {
    if (isCancel(value)) {
      console.log(pc.yellow('Cancelled.'));
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

  intro(`${pc.cyan(appName)} — Java Web generator (Servlet/JSP)`);

  const cliProjectName = String(cli?.projectName || '').trim();
  const cliYes = Boolean(cli?.yes);
  const cliServerTarget = cli?.serverTarget === 'wildfly' ? 'wildfly' : cli?.serverTarget === 'tomcat' ? 'tomcat' : null;

  const projectName = cliYes
    ? cliProjectName
    : await askText('Project name', {
        placeholder: 'my-webapp',
        defaultValue: cliProjectName || 'my-webapp',
        transform: (value) => String(value).trim(),
        validate: (value) => validateNonEmpty(value, 'Project name')
      });

  const defaultArtifactId = slugifyArtifactId(projectName) || 'mon-webapp';
  const artifactId = cliYes
    ? defaultArtifactId
    : await askText('Maven artifactId', {
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
    : await askText('Base package', {
        placeholder: defaultPackage,
        defaultValue: defaultPackage,
        transform: sanitizePackage,
        validate: (value) => validateQualifiedName(value, { minSegments: 2, label: 'Base package' })
      });

  const defaultDirName = String(projectName || artifactId).trim() || artifactId;
  const defaultLocation = path.join(process.cwd(), defaultDirName);
  const location = cliYes
    ? path.resolve(expandHome(defaultLocation))
    : await askText('Project location', {
        placeholder: defaultLocation,
        defaultValue: defaultLocation,
        transform: (value) => path.resolve(expandHome(value)),
        validate: (value) => validateLocation(value)
      });
  const targetDir = location;

  const serverTarget = cliServerTarget || (cliYes ? null : exitOnCancel(await select({ message: 'Target server', options: serverOptions })));
  const javaDetection = detectJavaCompiler();

  if (!javaDetection.present) {
    console.log(pc.red('Java (JDK) is missing or `javac` cannot be found.'));
    console.log(pc.yellow(`Required install: ${installHint('java')}`));
    console.log(pc.yellow('Creation is stopped until a compatible JDK is available.'));
    process.exit(1);
  }

  const javaCompatibility = evaluateJavaCompatibility(javaDetection.majorRelease);
  if (javaCompatibility.status !== 'ok') {
    console.log(pc.red(`Java detected but not usable for this project: ${javaDetection.display}`));
    console.log(pc.red(javaCompatibility.reason));
    console.log(pc.yellow(`Upgrade required: ${installHint('java')}`));
    console.log(pc.yellow('Creation is stopped until a compatible JDK is available.'));
    process.exit(1);
  }

  const javaRelease = javaDetection.majorRelease;
  const addServlet = cliYes ? true : exitOnCancel(await confirm({ message: 'Create an example /hello servlet?', initialValue: true }));
  const addJsp = cliYes ? true : exitOnCancel(await confirm({ message: 'Create an index.jsp page?', initialValue: true }));
  const addWebXml = cliYes ? false : exitOnCancel(await confirm({ message: 'Create web.xml?', initialValue: false }));
  const addGitignore = cliYes ? true : exitOnCancel(await confirm({ message: 'Create .gitignore?', initialValue: true }));
  const buildNow = cliYes ? false : exitOnCancel(await confirm({ message: 'Build project after creation?', initialValue: false }));

  if (existsSync(targetDir)) {
    console.log(pc.red(`Directory already exists: ${targetDir}`));
    process.exit(1);
  }

  note(
    [
      `Project: ${projectName}`,
      `artifactId : ${artifactId}`,
      `Deployed name: ${deployedAppName}`,
      `Location: ${targetDir}`,
      `groupId : ${groupId}`,
      `package: ${basePackage}`,
      `server: ${serverTarget || 'unset (will be requested on first --dev/--deploy)'}`,
      `Detected Java: ${javaDetection.display}`,
      `Java version: ${javaRelease}`,
      `Servlet: ${addServlet ? 'yes' : 'no'}`,
      `JSP: ${addJsp ? 'yes' : 'no'}`,
      `web.xml: ${addWebXml ? 'yes' : 'no'}`,
      `Build: ${buildNow ? 'yes' : 'no'}`,
      `Dev URL: http://localhost:8080/${deployedAppName}/`
    ].join('\n'),
    'Summary'
  );

  if (!cliYes) {
    const shouldCreate = exitOnCancel(await confirm({ message: `Create project here?\n${targetDir}`, initialValue: true }));
    if (!shouldCreate) {
      console.log(pc.yellow('Cancelled. No files were created.'));
      process.exit(0);
    }
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-'));
  const workDir = path.join(tempRoot, artifactId);
  const s = spinner();
  s.start('Generating...');

  try {
    const pkgPath = packageToPath(basePackage);
    const filterPackage = `${basePackage}.dev`;
    const filterPackagePath = packageToPath(filterPackage);
    const scriptsDir = jwebgenScriptsDir(workDir);
    await mkdir(path.join(workDir, 'src/main/java', pkgPath), { recursive: true });
    await mkdir(path.join(workDir, 'src/main/java', filterPackagePath), { recursive: true });
    await mkdir(path.join(workDir, 'src/main/webapp/WEB-INF'), { recursive: true });
    await mkdir(path.join(workDir, 'src/main/webapp/.jwebgen'), { recursive: true });
    await mkdir(scriptsDir, { recursive: true });

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
    await writeFileSafe(
      path.join(workDir, 'src/main/java', filterPackagePath, 'DevLiveReloadFilter.java'),
      devLiveReloadFilter({ basePackage: filterPackage })
    );
    await writeFileSafe(path.join(workDir, 'src/main/webapp/.jwebgen/live-reload.js'), makeLiveReloadClientScript());
    if (addJsp) {
      await writeFileSafe(path.join(workDir, 'src/main/webapp', 'index.jsp'), indexJsp({ projectName, artifactId, hasServlet: addServlet }));
    }
    if (serverTarget === 'tomcat') await writeFileSafe(path.join(workDir, 'src/main/webapp/META-INF', 'context.xml'), tomcatContextXmlDev());
    if (addWebXml) await writeFileSafe(path.join(workDir, 'src/main/webapp/WEB-INF', 'web.xml'), webXml({ projectName }));
    if (addGitignore) await writeFileSafe(path.join(workDir, '.gitignore'), gitignore());

    await writeFileSafe(
      path.join(workDir, '.jwebgen', 'README.md'),
      readmeMd({
        projectName,
        artifactId,
        groupId,
        basePackage,
        location: targetDir,
        stackMode: 'modern',
        serverTarget: serverTarget || 'unset',
        javaRelease,
        hasServlet: addServlet,
        hasJsp: addJsp,
        appName: deployedAppName,
        contextPath: deployedAppName
      })
    );
    await writeFileSafe(path.join(workDir, '.jwebgen', 'DEV.md'), makeDevMd({ appName: deployedAppName, serverTarget: serverTarget || 'unset' }));
    await writeFileSafe(path.join(scriptsDir, 'build.sh'), makeBuildScript());
    await writeFileSafe(path.join(scriptsDir, 'deploy.sh'), makeDeploySelectorScript());
    await writeFileSafe(
      path.join(scriptsDir, 'deploy-tomcat.sh'),
      makeDeployServerScript({ appName: deployedAppName, serverTarget: 'tomcat' })
    );
    await writeFileSafe(
      path.join(scriptsDir, 'deploy-wildfly.sh'),
      makeDeployServerScript({ appName: deployedAppName, serverTarget: 'wildfly' })
    );
    await writeFileSafe(path.join(scriptsDir, 'dev.sh'), makeDevScript({ serverTarget }));
    await writeFileSafe(path.join(scriptsDir, 'watch.sh'), makeWatchScript());
    if (typeof makeNodeBuildScript === 'function') await writeFileSafe(path.join(scriptsDir, 'build.mjs'), makeNodeBuildScript());
    if (typeof makeNodeDeployScript === 'function') await writeFileSafe(path.join(scriptsDir, 'deploy.mjs'), makeNodeDeployScript());
    if (typeof makeNodeDevScript === 'function') await writeFileSafe(path.join(scriptsDir, 'dev.mjs'), makeNodeDevScript());
    if (typeof makeNodeWatchScript === 'function') await writeFileSafe(path.join(scriptsDir, 'watch.mjs'), makeNodeWatchScript());
    if (addServlet) await writeFileSafe(path.join(scriptsDir, 'add-servlet.sh'), makeAddServletScript({ basePackage }));
    if (serverTarget === 'tomcat' || serverTarget === 'wildfly') {
      await writeFileSafe(path.join(workDir, '.jwebgen', '.jwebgenrc'), `export JWEBGEN_SERVER_TARGET="${serverTarget}"\n`);
    }

    const scriptFiles = [
      '.jwebgen/scripts/build.sh',
      '.jwebgen/scripts/deploy.sh',
      '.jwebgen/scripts/deploy-tomcat.sh',
      '.jwebgen/scripts/deploy-wildfly.sh',
      '.jwebgen/scripts/dev.sh',
      '.jwebgen/scripts/watch.sh',
      typeof makeNodeBuildScript === 'function' ? '.jwebgen/scripts/build.mjs' : null,
      typeof makeNodeDeployScript === 'function' ? '.jwebgen/scripts/deploy.mjs' : null,
      typeof makeNodeDevScript === 'function' ? '.jwebgen/scripts/dev.mjs' : null,
      typeof makeNodeWatchScript === 'function' ? '.jwebgen/scripts/watch.mjs' : null,
      addServlet ? '.jwebgen/scripts/add-servlet.sh' : null
    ].filter(Boolean);
    for (const relativePath of scriptFiles) await makeExecutable(path.join(workDir, relativePath));
    await mkdir(path.dirname(targetDir), { recursive: true });
    await cp(workDir, targetDir, { recursive: true, force: true });
    for (const relativePath of scriptFiles) await makeExecutable(path.join(targetDir, relativePath));
    s.stop('Done.');
  } catch (error) {
    s.stop('Generation interrupted.');
    throw error;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(pc.green(`\n✅ Project created: ${targetDir}`));
  if (buildNow) {
    const { javaOk, mavenOk } = await ensureBuildTools();
    if (!javaOk) console.log(pc.yellow(`Java not found. ${installHint('java')}`));
    if (!mavenOk) console.log(pc.yellow(`Maven not found. ${installHint('maven')}`));
    if (javaOk && mavenOk) {
      const build = spinner();
        build.start('Running Maven build...');
      try {
        await execa('mvn', ['clean', 'package'], { cwd: targetDir, stdio: 'inherit' });
        build.stop('Build OK');
      } catch {
        build.stop('Build failed.');
        console.error(pc.red('Maven build failed.'));
        process.exit(1);
      }
    } else {
      console.log(pc.yellow('Build skipped while Java or Maven is missing.'));
    }
  }

  console.log(pc.cyan('\nQuick development commands:'));
  console.log(pc.cyan('- ./.jwebgen/scripts/build.sh'));
  console.log(pc.cyan('- ./.jwebgen/scripts/deploy.sh'));
  console.log(pc.cyan('- ./.jwebgen/scripts/dev.sh'));
  console.log(pc.cyan('- ./.jwebgen/scripts/watch.sh'));
  if (addServlet) console.log(pc.cyan('- jwebgen --servlet HelloServlet'));
  outro(pc.cyan('Done.'));
}
