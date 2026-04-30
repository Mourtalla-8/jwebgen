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
import {
  gitignore,
  helloServlet,
  indexJsp,
  pomXml,
  readmeMd,
  tomcatContextXmlDev,
  webXml
} from '../src/templates.js';
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
  makeLiveReloadServerScript as makeLiveReloadServerScriptImpl,
  makeLiveReloadSnippet as makeLiveReloadSnippetImpl,
  makeAddServletScript as makeAddServletScriptImpl,
  makeDevMd as makeDevMdImpl
} from '../src/generate/devAssets.js';
import {
  makeBuildScript as makeBuildScriptImpl,
  makeDeployTomcatScript as makeDeployTomcatScriptImpl,
  makeDeployServerScript as makeDeployServerScriptImpl,
  makeDevScript as makeDevScriptImpl,
  makeWatchScript as makeWatchScriptImpl
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
import { runCreateCommand } from '../src/cli/createCommand.js';
import { writeFileSafe, makeExecutable } from '../src/cli/fileUtils.js';

const APP_NAME = 'jwebgen';
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

async function main() {
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
    makeDevScript: makeDevScriptImpl,
    makeWatchScript: makeWatchScriptImpl,
    makeAddServletScript: ({ basePackage }) => makeAddServletScriptImpl({ basePackage, appName: APP_NAME }),
    makeExecutable,
    ensureBuildTools,
    gitignore,
    helloServlet,
    indexJsp,
    pomXml,
    readmeMd,
    tomcatContextXmlDev,
    webXml
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
    makeDevScript: makeDevScriptImpl,
    makeWatchScript: makeWatchScriptImpl,
    makeAddServletScript: ({ basePackage }) => makeAddServletScriptImpl({ basePackage, appName: APP_NAME }),
    makeExecutable,
    legacyDeployScript: LEGACY_DEPLOY_SCRIPT
  });
}

function showHelp() {
  // Keep CLI help source centralized in flags formatting.
  console.log(formatFlagsHelp({ appName: APP_NAME }));
}

async function runCli() {
  const [, , ...argv] = process.argv;
  if (argv.length === 0) {
    showHelp();
    return;
  }

  if (isLikelyLegacySubcommand(argv[0])) {
    console.log(pc.yellow('Ancien format de commande détecté (subcommands).'));
    console.log(pc.yellow('Le nouveau CLI est flags-only. Exemple:'));
    console.log(pc.cyan('  jwebgen --dev'));
    console.log(pc.cyan('  jwebgen --new mon-webapp'));
    console.log('');
    showHelp();
    process.exit(1);
  }

  const parsed = parseFlags(argv);
  if (parsed.unknown.length > 0) {
    console.log(pc.yellow(`Option inconnue: ${parsed.unknown.join(' ')}`));
    showHelp();
    process.exit(1);
  }
  if (parsed.actionCount > 1) {
    console.log(pc.yellow('Une seule action principale est autorisée à la fois.'));
    showHelp();
    process.exit(1);
  }

  const { flags, action } = parsed;
  if (flags.help || !action) {
    showHelp();
    return;
  }

  if (action === 'status') return await showStatus();
  if (action === 'clean') return await runClean();
  if (action === 'migrate') return await runMigrate();
  if (action === 'build') return await runProjectScript('build.sh', flags.args);
  if (action === 'deploy') return await runProjectScript('deploy.sh', flags.args);
  if (action === 'dev') {
    return await runProjectScript('dev.sh', flags.args, { verbose: flags.verbose });
  }
  if (action === 'servlet') {
    if (flags.args.length === 0) {
      console.log(pc.yellow('Usage: jwebgen --servlet <Name>'));
      process.exit(1);
    }
    return await runProjectScript('add-servlet.sh', flags.args);
  }
  if (action === 'create') {
    // Phase 2 will add --yes + non-interactive create path.
    // For now: always interactive.
    return await main();
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
