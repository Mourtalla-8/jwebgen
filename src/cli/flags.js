import pc from 'picocolors';

const ACTION_FLAGS = new Set([
  '--help',
  '--version',
  '--status',
  '--start',
  '--stop',
  '--restart',
  '--reload',
  '--setup',
  '--install',
  '--update',
  '--uninstall',
  '--dev',
  '--watch',
  '--build',
  '--deploy',
  '--clean',
  '--migrate',
  '--servlet',
  '--jsp',
  '--new',
  '--create'
]);

export function parseFlags(argv = []) {
  const flags = {
    help: false,
    version: false,
    setup: false,
    install: false,
    installTool: null,
    update: false,
    uninstall: false,
    status: false,
    dev: false,
    build: false,
    deploy: false,
    clean: false,
    cleanDeploy: false,
    migrate: false,
    servlet: false,
    jsp: false,
    create: false,
    watch: false,
    yes: false,
    verbose: false,
    dryRun: false,
    server: null, // tomcat|wildfly|null
    args: []
  };

  const unknown = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a === '--version' || a === '-V' || a === '-v') {
      flags.version = true;
      continue;
    }
    if (a === '--setup') {
      flags.setup = true;
      continue;
    }
    if (a === '--install') {
      flags.install = true;
      const next = argv[i + 1];
      if (next && !String(next).startsWith('-')) {
        flags.installTool = String(next).toLowerCase();
        i += 1;
      }
      continue;
    }
    if (a === '--update') {
      flags.update = true;
      continue;
    }
    if (a === '--uninstall') {
      flags.uninstall = true;
      continue;
    }
    if (a === '--status') {
      flags.status = true;
      continue;
    }
    if (a === '--dev') {
      flags.dev = true;
      continue;
    }
    if (a === '--watch') {
      flags.watch = true;
      continue;
    }
    if (a === '--build') {
      flags.build = true;
      continue;
    }
    if (a === '--deploy') {
      flags.deploy = true;
      continue;
    }
    if (a === '--clean') {
      flags.clean = true;
      continue;
    }
    if (a === '--migrate' || a === '-m') {
      flags.migrate = true;
      continue;
    }
    if (a === '--servlet') {
      flags.servlet = true;
      continue;
    }
    if (a === '--jsp') {
      flags.jsp = true;
      continue;
    }
    if (a === '--new' || a === '-n' || a === '--create' || a === '-c') {
      flags.create = true;
      continue;
    }
    if (a === '--yes' || a === '-y') {
      flags.yes = true;
      continue;
    }
    if (a === '--verbose') {
      flags.verbose = true;
      continue;
    }
    if (a === '--dry-run') {
      flags.dryRun = true;
      continue;
    }
    if (a === '--tomcat' || a === '-t') {
      flags.server = 'tomcat';
      continue;
    }
    if (a === '--wildfly' || a === '-w') {
      flags.server = 'wildfly';
      continue;
    }

    if (String(a).startsWith('--')) {
      unknown.push(a);
      continue;
    }
    if (String(a).startsWith('-')) {
      unknown.push(a);
      continue;
    }
    flags.args.push(a);
  }

  const actions = [
    flags.help ? 'help' : null,
    flags.version ? 'version' : null,
    flags.install ? 'install' : null,
    flags.setup ? 'setup' : null,
    flags.update ? 'update' : null,
    flags.uninstall ? 'uninstall' : null,
    flags.status ? 'status' : null,
    (flags.dev || flags.watch) ? 'dev' : null,
    flags.build ? 'build' : null,
    flags.deploy ? 'deploy' : null,
    flags.clean ? 'clean' : null,
    flags.migrate ? 'migrate' : null,
    flags.servlet ? 'servlet' : null,
    flags.jsp ? 'jsp' : null,
    flags.create ? 'create' : null
  ].filter(Boolean);

  if (flags.clean && flags.deploy) {
    flags.cleanDeploy = true;
  }

  const effectiveActions = flags.cleanDeploy
    ? actions.filter((a) => a !== 'deploy')
    : actions;

  return {
    flags,
    action: effectiveActions[0] || null,
    actionCount: effectiveActions.length,
    unknown
  };
}

export function formatFlagsHelp({ appName = 'jwebgen' } = {}) {
  const title = pc.bold(pc.cyan(`${appName} - Java Web CLI`));
  const usage = `${pc.bold('Usage:')} ${appName} [option]`;
  const cmd = (s) => pc.green(s.padEnd(48, ' '));
  const desc = (s) => pc.white(s);
  const section = (name) => `\n${pc.bold(pc.yellow(name))}`;
  return [
    title,
    usage,
    section('Main Commands'),
    `  ${cmd('--help, -h')}${desc('Show this help message.')}`,
    `  ${cmd('--version, -V, -v')}${desc('Show jwebgen version.')}`,
    `  ${cmd('--setup [--dry-run]')}${desc('Run setup diagnostics + guided safe actions; preview only with --dry-run.')}`,
    `  ${cmd('--install <maven|tomcat|wildfly>')}${desc('Install a missing tool using built-in drivers (non-interactive).')}`,
    `  ${cmd('server <start|stop|status> <tomcat|wildfly>')}${desc('Global server control (outside project mode).')}`,
    `  ${cmd('--update')}${desc('Show safe update guidance for global installs.')}`,
    `  ${cmd('--uninstall')}${desc('Show safe uninstall guidance for global installs.')}`,
    `  ${cmd('--status')}${desc('Show project status.')}`,
    `  ${cmd('--dev')}${desc('Start dev loop in current project.')}`,
    `  ${cmd('--verbose')}${desc('Enable verbose mode for applicable actions (e.g. --dev).')}`,
    `  ${cmd('--watch')}${desc('Alias for --dev.')}`,
    `  ${cmd('--build')}${desc('Run project build script.')}`,
    `  ${cmd('--deploy')}${desc('Run project deploy script.')}`,
    `  ${cmd('--clean')}${desc('Remove target/ in current project.')}`,
    `  ${cmd('--clean --deploy')}${desc('Clean deployed app on selected server (current project only).')}`,
    `  ${cmd('--migrate, -m')}${desc('Upgrade a legacy jwebgen project.')}`,
    `  ${cmd('--servlet <Name>')}${desc('Create a servlet (class name auto-normalized).')}`,
    `  ${cmd('--jsp <name>')}${desc('Create a JSP under WEB-INF/jsp (adds .jsp if missing).')}`,
    section('Project Creation'),
    `  ${cmd('--new, -n <projectName>')}${desc('Create a new project (interactive by default).')}`,
    `  ${cmd('--create, -c <projectName>')}${desc('Alias for --new.')}`,
    `  ${cmd('--yes, -y')}${desc('Non-interactive create mode (requires <projectName>).')}`,
    `  ${cmd('--tomcat, -t / --wildfly, -w')}${desc('Choose server target for create/dev/deploy flows.')}`,
    section('Dev Note'),
    `  ${desc('If multiple servers/services listen on port 8080 on the same machine,')}`,
    `  ${desc('dev/deploy can fail with port conflicts. Keep only one HTTP server active')}`,
    `  ${desc('or set another app port with JWEBGEN_HTTP_PORT.')}`
  ].join('\n');
}

export function isLikelyLegacySubcommand(token) {
  if (!token) return false;
  if (String(token).startsWith('-')) return false;
  // Anything that isn't a flag, and isn't a value to a flag in this simple parser,
  // is treated as legacy subcommand.
  return !ACTION_FLAGS.has(token);
}

