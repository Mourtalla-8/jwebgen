const ACTION_FLAGS = new Set([
  '--help',
  '--status',
  '--start',
  '--stop',
  '--restart',
  '--reload',
  '--setup',
  '--dev',
  '--watch',
  '--build',
  '--deploy',
  '--clean',
  '--migrate',
  '--servlet',
  '--new',
  '--create'
]);

export function parseFlags(argv = []) {
  const flags = {
    help: false,
    status: false,
    dev: false,
    build: false,
    deploy: false,
    clean: false,
    cleanDeploy: false,
    migrate: false,
    servlet: false,
    create: false,
    watch: false,
    yes: false,
    verbose: false,
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
    if (a === '--new' || a === '-n' || a === '--create' || a === '-c') {
      flags.create = true;
      continue;
    }
    if (a === '--yes' || a === '-y') {
      flags.yes = true;
      continue;
    }
    if (a === '--verbose' || a === '-v') {
      flags.verbose = true;
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
    flags.args.push(a);
  }

  const actions = [
    flags.help ? 'help' : null,
    flags.status ? 'status' : null,
    (flags.dev || flags.watch) ? 'dev' : null,
    flags.build ? 'build' : null,
    flags.deploy ? 'deploy' : null,
    flags.clean ? 'clean' : null,
    flags.migrate ? 'migrate' : null,
    flags.servlet ? 'servlet' : null,
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
  return `
Usage: ${appName} [option]

Options:

--help, -h
  This help message.

--status
  Show project status.

--dev
  Start dev loop in current project.

--watch
  Alias for --dev.

--build
  Run project build script.

--deploy
  Run project deploy script.

--clean
  Remove target/ in current project.

--clean --deploy
  Clean deployed app from server for current project only.

--migrate, -m
  Upgrade a legacy jwebgen project.

--servlet <Name>
  Create a servlet (class name auto-normalized).

--new, -n <projectName>
--create, -c <projectName>
  Create a new project (interactive by default).

--yes, -y
  Non-interactive mode for project creation (requires <projectName>).

--tomcat, -t / --wildfly, -w
  Choose server target (used during creation; and later in dev/deploy flows).
`.trim();
}

export function isLikelyLegacySubcommand(token) {
  if (!token) return false;
  if (String(token).startsWith('-')) return false;
  // Anything that isn't a flag, and isn't a value to a flag in this simple parser,
  // is treated as legacy subcommand.
  return !ACTION_FLAGS.has(token);
}

