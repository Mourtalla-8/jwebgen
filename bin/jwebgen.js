#!/usr/bin/env node
import {
  intro,
  outro,
  text,
  select,
  confirm,
  spinner,
  isCancel,
  note
} from '@clack/prompts';
import pc from 'picocolors';
import { gitignore, helloServlet, indexJsp, pomXml, readmeMd, tomcatContextXmlDev, webXml } from '../src/templates.js';
import {
  slugifyArtifactId as slugifyArtifactIdImpl,
  normalizePackageCandidate as normalizePackageCandidateImpl,
  sanitizePackage as sanitizePackageImpl,
  packageToPath as packageToPathImpl,
  artifactPackagePart as artifactPackagePartImpl,
  expandHome as expandHomeImpl,
  detectJavaCompiler as detectJavaCompilerImpl,
  evaluateJavaCompatibility as evaluateJavaCompatibilityImpl,
  installHint as installHintImpl,
  which as whichImpl,
  validateArtifactId as validateArtifactIdImpl,
  validateQualifiedName as validateQualifiedNameImpl,
  validateLocation as validateLocationImpl,
  validateNonEmpty as validateNonEmptyImpl
} from '../src/project/inputUtils.js';
import {
  makeLiveReloadClientScript as makeLiveReloadClientScriptImpl,
  makeLiveReloadServerScript as makeLiveReloadServerScriptImpl,
  makeLiveReloadSnippet as makeLiveReloadSnippetImpl,
  makeAddServletScript as makeAddServletScriptImpl,
  makeAddJspScript as makeAddJspScriptImpl,
  makeAddServletNodeScript as makeAddServletNodeScriptImpl,
  makeAddJspNodeScript as makeAddJspNodeScriptImpl,
  makeDevMd as makeDevMdImpl
} from '../src/generate/devAssets.js';
import {
  makeBuildScript as makeBuildScriptImpl,
  makeDeployTomcatScript as makeDeployTomcatScriptImpl,
  makeDeployServerScript as makeDeployServerScriptImpl,
  makeDeploySelectorScript as makeDeploySelectorScriptImpl,
  makeDevScript as makeDevScriptImpl,
  makeWatchScript as makeWatchScriptImpl,
  makeNodeBuildScript as makeNodeBuildScriptImpl,
  makeNodeDeployScript as makeNodeDeployScriptImpl,
  makeNodeDevScript as makeNodeDevScriptImpl,
  makeNodeWatchScript as makeNodeWatchScriptImpl
} from '../src/generate/scriptTemplates.js';
import { parseFlags, formatFlagsHelp, isLikelyLegacySubcommand } from '../src/cli/flags.js';
import { detectLegacyProjectIssues as detectLegacyProjectIssuesModule } from '../src/project/legacyDetection.js';
import {
  findProjectRoot as findProjectRootImpl,
  parseCliOptions as parseCliOptionsImpl,
  detectServerTargetFromProject as detectServerTargetFromProjectImpl,
  showHelp as showHelpImpl
} from '../src/cli/projectCliUtils.js';
import {
  runClean as runCleanImpl,
  runMigrate as runMigrateImpl,
  showStatus as showStatusImpl
} from '../src/cli/projectCommands.js';
import { runProjectScript as runProjectScriptImpl } from '../src/cli/projectRunner.js';
import { enforceActionPreflight, runSetupAssistant, runSetupCheck } from '../src/cli/preflight.js';
import { runCreateCommand } from '../src/cli/createCommand.js';
import { writeFileSafe, makeExecutable } from '../src/cli/fileUtils.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { jwebgenConfigPath, jwebgenMetaDir } from '../src/project/jwebgenLayout.js';
import pkg from '../package.json' with { type: 'json' };

const APP_NAME = 'jwebgen';
const APP_VERSION = pkg.version;
const CANONICAL_DEPLOY_SCRIPT = 'deploy.sh';
const LEGACY_DEPLOY_SCRIPT = 'deploy-tomcat.sh';

const SERVER_OPTIONS = [
  { value: 'tomcat', label: 'Tomcat' },
  { value: 'wildfly', label: 'WildFly' }
];

async function ensureBuildTools() {
  return {
    javaOk: whichImpl('javac'),
    mavenOk: whichImpl('mvn')
  };
}

async function main(cli = {}) {
  return runCreateCommand({
    intro,
    outro,
    text,
    select,
    confirm,
    spinner,
    isCancel,
    note,
    appName: APP_NAME,
    serverOptions: SERVER_OPTIONS,
    validateNonEmpty: validateNonEmptyImpl,
    validateLocation: validateLocationImpl,
    slugifyArtifactId: slugifyArtifactIdImpl,
    validateArtifactId: validateArtifactIdImpl,
    normalizePackageCandidate: normalizePackageCandidateImpl,
    validateQualifiedName: validateQualifiedNameImpl,
    sanitizePackage: sanitizePackageImpl,
    artifactPackagePart: artifactPackagePartImpl,
    expandHome: expandHomeImpl,
    detectJavaCompiler: detectJavaCompilerImpl,
    installHint: installHintImpl,
    evaluateJavaCompatibility: (majorRelease) => evaluateJavaCompatibilityImpl(majorRelease, 11),
    packageToPath: packageToPathImpl,
    writeFileSafe,
    makeDevMd: makeDevMdImpl,
    makeBuildScript: makeBuildScriptImpl,
    makeDeployServerScript: makeDeployServerScriptImpl,
    makeDeploySelectorScript: makeDeploySelectorScriptImpl,
    makeDevScript: makeDevScriptImpl,
    makeWatchScript: makeWatchScriptImpl,
    makeNodeBuildScript: makeNodeBuildScriptImpl,
    makeNodeDeployScript: makeNodeDeployScriptImpl,
    makeNodeDevScript: makeNodeDevScriptImpl,
    makeNodeWatchScript: makeNodeWatchScriptImpl,
    makeAddServletScript: ({ basePackage }) => makeAddServletScriptImpl({ basePackage, appName: APP_NAME }),
    makeAddJspScript: () => makeAddJspScriptImpl({ appName: APP_NAME }),
    makeAddServletNodeScript: ({ basePackage }) => makeAddServletNodeScriptImpl({ basePackage, appName: APP_NAME }),
    makeAddJspNodeScript: () => makeAddJspNodeScriptImpl({ appName: APP_NAME }),
    makeLiveReloadClientScript: makeLiveReloadClientScriptImpl,
    makeExecutable,
    ensureBuildTools,
    gitignore,
    helloServlet,
    indexJsp,
    pomXml,
    readmeMd,
    tomcatContextXmlDev,
    webXml,
    cli
  });
}

function findProjectRoot(startDir = process.cwd()) {
  return findProjectRootImpl(startDir);
}

async function runProjectScript(scriptName, args = [], options = {}) {
  return runProjectScriptImpl(scriptName, args, options, {
    findProjectRoot,
    detectLegacyProjectIssues: detectLegacyProjectIssuesModule,
    canonicalDeployScript: CANONICAL_DEPLOY_SCRIPT,
    legacyDeployScript: LEGACY_DEPLOY_SCRIPT
  });
}

async function runClean() {
  return runCleanImpl({ findProjectRoot });
}

async function showStatus() {
  return showStatusImpl({ findProjectRoot });
}

function detectServerTargetFromProject(projectRoot) {
  return detectServerTargetFromProjectImpl(projectRoot);
}

async function runMigrate() {
  return runMigrateImpl({
    findProjectRoot,
    detectServerTargetFromProject,
    writeFileSafe,
    makeBuildScript: makeBuildScriptImpl,
    makeDeployServerScript: makeDeployServerScriptImpl,
    makeDeploySelectorScript: makeDeploySelectorScriptImpl,
    makeDevScript: makeDevScriptImpl,
    makeWatchScript: makeWatchScriptImpl,
    makeNodeBuildScript: makeNodeBuildScriptImpl,
    makeNodeDeployScript: makeNodeDeployScriptImpl,
    makeNodeDevScript: makeNodeDevScriptImpl,
    makeNodeWatchScript: makeNodeWatchScriptImpl,
    makeAddServletScript: ({ basePackage }) => makeAddServletScriptImpl({ basePackage, appName: APP_NAME }),
    makeAddJspScript: () => makeAddJspScriptImpl({ appName: APP_NAME }),
    makeAddServletNodeScript: ({ basePackage }) => makeAddServletNodeScriptImpl({ basePackage, appName: APP_NAME }),
    makeAddJspNodeScript: () => makeAddJspNodeScriptImpl({ appName: APP_NAME }),
    makeLiveReloadClientScript: makeLiveReloadClientScriptImpl,
    makeExecutable,
    legacyDeployScript: LEGACY_DEPLOY_SCRIPT
  });
}

async function readConfiguredServerTarget(projectRoot) {
  const cfgPath = jwebgenConfigPath(projectRoot);
  if (!existsSync(cfgPath)) return null;
  try {
    const raw = await readFile(cfgPath, 'utf8');
    const m = raw.match(/JWEBGEN_SERVER_TARGET\s*=\s*"?([a-zA-Z0-9_-]+)"?/);
    const v = String(m?.[1] || '').trim();
    if (v === 'tomcat' || v === 'wildfly') return v;
    return null;
  } catch {
    return null;
  }
}

async function writeConfiguredServerTarget(projectRoot, target) {
  await mkdir(jwebgenMetaDir(projectRoot), { recursive: true });
  const cfgPath = jwebgenConfigPath(projectRoot);
  const content = `export JWEBGEN_SERVER_TARGET="${target}"\n`;
  await writeFile(cfgPath, content, 'utf8');
}

async function ensureServerTarget({ projectRoot, requestedTarget }) {
  if (requestedTarget === 'tomcat' || requestedTarget === 'wildfly') {
    await writeConfiguredServerTarget(projectRoot, requestedTarget);
    return requestedTarget;
  }
  const configured = await readConfiguredServerTarget(projectRoot);
  if (configured) return configured;
  if (!process.stdin.isTTY) {
    console.log(pc.red('Server target is not configured.'));
    console.log(pc.yellow('Pass --tomcat/--wildfly or configure .jwebgen/.jwebgenrc'));
    process.exit(1);
  }
  const chosen = await select({
    message: 'Target server',
    options: SERVER_OPTIONS
  });
  if (isCancel(chosen)) process.exit(0);
  await writeConfiguredServerTarget(projectRoot, chosen);
  return chosen;
}

function showHelp() {
  // Keep CLI help source centralized in flags formatting.
  console.log(formatFlagsHelp({ appName: APP_NAME }));
}

function showVersion() {
  console.log(`${APP_NAME} ${APP_VERSION}`);
}

function showUpdateGuidance() {
  console.log(pc.cyan('Safe update flow (global install):'));
  console.log('  npm i -g jwebgen@latest');
  console.log(pc.cyan('If installed from source checkout:'));
  console.log('  git pull');
  console.log('  npm ci');
  console.log('  npm i -g .');
  console.log(pc.cyan('If global shim is not available, run from local checkout:'));
  console.log('  npx jwebgen --update');
  console.log('  node bin/jwebgen.js --update');
}

function showUninstallGuidance() {
  console.log(pc.cyan('Safe uninstall flow (global install):'));
  console.log('  npm uninstall -g jwebgen');
  console.log(pc.cyan('If running from a local checkout only:'));
  console.log('  npx jwebgen --help');
  console.log('  node ./bin/jwebgen.js --help');
  console.log('  remove the clone folder when you no longer need local one-off runs.');
  console.log(pc.cyan('Optional cleanup: remove old clones or temp projects manually.'));
}

async function runCli() {
  const [, , ...argv] = process.argv;
  if (argv.length === 0) {
    showHelp();
    return;
  }

  if (isLikelyLegacySubcommand(argv[0])) {
    console.log(pc.yellow('Unsupported command form.'));
    console.log(pc.yellow('Use a flag instead:'));
    console.log(pc.cyan('  jwebgen --dev'));
    console.log(pc.cyan('  jwebgen --new my-webapp'));
    console.log('');
    showHelp();
    process.exit(1);
  }

  const parsed = parseFlags(argv);
  if (parsed.unknown.length > 0) {
    console.log(pc.yellow(`Unknown option: ${parsed.unknown.join(' ')}`));
    showHelp();
    process.exit(1);
  }
  if (parsed.actionCount > 1) {
    console.log(pc.yellow('Only one main action is allowed at a time.'));
    showHelp();
    process.exit(1);
  }

  const { flags, action } = parsed;
  if (flags.help || !action) {
    showHelp();
    return;
  }
  if (action === 'version') return showVersion();
  if (action === 'setup') {
    const ok = (process.stdin.isTTY && process.stdout.isTTY)
      ? await runSetupAssistant({
          dryRun: flags.dryRun,
          confirmPrompt: async ({ message, initialValue }) => {
            const answer = await confirm({ message, initialValue });
            if (isCancel(answer)) return false;
            return Boolean(answer);
          },
          selectPrompt: async ({ message, options }) => {
            const answer = await select({
              message,
              options: options.map((opt) => ({ value: opt, label: opt }))
            });
            if (isCancel(answer)) return null;
            return answer;
          }
        })
      : runSetupCheck({ dryRun: flags.dryRun });
    if (!ok) process.exit(1);
    return;
  }
  if (action === 'update') return showUpdateGuidance();
  if (action === 'uninstall') return showUninstallGuidance();

  enforceActionPreflight(action);

  if (action === 'status') return await showStatus();
  if (action === 'clean') {
    if (flags.cleanDeploy) {
      return await runProjectScript('deploy.sh', ['--cleanup-dev']);
    }
    return await runClean();
  }
  if (action === 'migrate') return await runMigrate();
  if (action === 'build') return await runProjectScript('build.sh', flags.args);
  if (action === 'deploy') {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      console.error(pc.red('No jwebgen project detected.'));
      process.exit(1);
    }
    const target = await ensureServerTarget({ projectRoot, requestedTarget: flags.server });
    return await runProjectScript('deploy.sh', flags.args, { env: { JWEBGEN_SERVER_TARGET: target } });
  }
  if (action === 'dev') {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      console.error(pc.red('No jwebgen project detected.'));
      process.exit(1);
    }
    const target = await ensureServerTarget({ projectRoot, requestedTarget: flags.server });
    return await runProjectScript('dev.sh', flags.args, {
      verbose: flags.verbose,
      env: { JWEBGEN_SERVER_TARGET: target }
    });
  }
  if (action === 'servlet') {
    if (flags.args.length === 0) {
      console.log(pc.yellow('Usage: jwebgen --servlet <Name>'));
      process.exit(1);
    }
    return await runProjectScript('add-servlet.sh', flags.args);
  }
  if (action === 'jsp') {
    if (flags.args.length === 0) {
      console.log(pc.yellow('Usage: jwebgen --jsp <name>'));
      process.exit(1);
    }
    return await runProjectScript('add-jsp.sh', flags.args);
  }
  if (action === 'create') {
    const projectName = flags.args[0] || '';
    if (flags.yes && !projectName) {
      console.log(pc.yellow('Usage: jwebgen --new <projectName> --yes'));
      process.exit(1);
    }
    return await main({
      projectName,
      yes: flags.yes,
      serverTarget: flags.server
    });
  }

  showHelp();
}

runCli().catch((error) => {
  if (error?.exitCode === 130 || error?.signal === 'SIGINT') {
    process.exit(0);
  }
  if (error?.jwebgenHandled) {
    process.exit(1);
  }
  console.error(pc.red(error?.stack || error?.message || String(error)));
  process.exit(1);
});
