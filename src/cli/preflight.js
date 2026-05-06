import pc from 'picocolors';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectJavaCompiler, evaluateJavaCompatibility, installHint, which } from '../project/inputUtils.js';

function hasCommand(binary) {
  if (which(binary)) return true;
  const probe = process.platform === 'win32' ? spawnSync('where', [binary], { stdio: 'ignore' }) : spawnSync('which', [binary], { stdio: 'ignore' });
  return probe.status === 0;
}

function getActionRequirements(action) {
  if (action === 'create') return ['node', 'java', 'maven'];
  if (action === 'build') return ['java', 'maven'];
  if (action === 'deploy' || action === 'dev' || action === 'servlet' || action === 'jsp') return ['node', 'java', 'maven'];
  return [];
}

function checkRequirement(req) {
  if (req === 'node') {
    const version = process.version;
    const [majorRaw, minorRaw] = version.replace(/^v/, '').split('.');
    const major = Number.parseInt(majorRaw, 10);
    const minor = Number.parseInt(minorRaw, 10);
    const ok = Number.isInteger(major) && Number.isInteger(minor) && (major > 20 || (major === 20 && minor >= 12));
    return {
      key: 'node',
      ok,
      display: ok ? `Node ${version}` : `Node ${version} (requires >= 20.12)`,
      hint: ok ? '' : 'Install Node.js 20.12+ from https://nodejs.org/'
    };
  }
  if (req === 'java') {
    const java = detectJavaCompiler();
    if (!java.present) {
      return { key: 'java', ok: false, display: 'javac not found', hint: installHint('java') };
    }
    const compatibility = evaluateJavaCompatibility(java.majorRelease, 11);
    return {
      key: 'java',
      ok: compatibility.status === 'ok',
      display: java.display || java.rawVersion || 'Java detected',
      hint: compatibility.status === 'ok' ? '' : `${compatibility.reason} ${installHint('java')}`
    };
  }
  if (req === 'maven') {
    const hasMvnCmd = hasCommand('mvn.cmd');
    const hasMvn = hasCommand('mvn');
    const ok = hasMvnCmd || hasMvn;
    const bin = hasMvnCmd ? 'mvn.cmd' : hasMvn ? 'mvn' : process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
    return {
      key: 'maven',
      ok,
      display: ok ? `${bin} detected` : `${bin} not found`,
      hint: ok ? '' : installHint('maven')
    };
  }
  return { key: req, ok: true, display: `${req} ok`, hint: '' };
}

function commandExistsInPath(commandName) {
  const envPath = String(process.env.PATH || '');
  const segments = envPath.split(path.delimiter).filter(Boolean);
  if (segments.length === 0) return false;
  const names = process.platform === 'win32'
    ? [commandName, `${commandName}.cmd`, `${commandName}.exe`, `${commandName}.bat`]
    : [commandName];
  for (const dir of segments) {
    for (const candidate of names) {
      if (existsSync(path.join(dir, candidate))) return true;
    }
  }
  return false;
}

function detectNpmGlobalBin() {
  const npmPrefix = spawnSync('npm', ['config', 'get', 'prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const prefix = String(npmPrefix.stdout || '').trim();
  const fallbackNpmBin = String(
    spawnSync('npm', ['bin', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout || ''
  ).trim();
  const prefixDerivedBin = prefix
    ? (process.platform === 'win32' ? prefix : path.join(prefix, 'bin'))
    : '';
  const windowsNodeModulesBin = (process.platform === 'win32' && prefix)
    ? path.join(prefix, 'node_modules', '.bin')
    : '';
  const binCandidates = [prefixDerivedBin, windowsNodeModulesBin, fallbackNpmBin].filter(Boolean);
  const bin = binCandidates[0] || '';
  const shimCandidates = process.platform === 'win32'
    ? ['jwebgen', 'jwebgen.cmd', 'jwebgen.ps1', 'jwebgen.exe']
    : ['jwebgen'];
  const hasShimInBin = bin && shimCandidates.some((name) => existsSync(path.join(bin, name)));
  const inPath = bin ? String(process.env.PATH || '').split(path.delimiter).includes(bin) : false;
  return {
    bin,
    prefix,
    hasBin: Boolean(bin),
    inPath,
    jwebgenReachable: commandExistsInPath('jwebgen'),
    hasShimButNotOnPath: Boolean(hasShimInBin && !inPath)
  };
}

function suggestedInstallCommands(requirementKey, platform = process.platform) {
  if (requirementKey === 'java') {
    if (platform === 'win32') return ['winget install EclipseAdoptium.Temurin.17.JDK'];
    if (platform === 'darwin') return ['brew install --cask temurin'];
    return ['sudo apt install -y default-jdk', 'sudo dnf install -y java-17-openjdk-devel', 'sudo pacman -S --noconfirm jdk-openjdk'];
  }
  if (requirementKey === 'maven') {
    if (platform === 'win32') return ['winget install Apache.Maven'];
    if (platform === 'darwin') return ['brew install maven'];
    return ['sudo apt install -y maven', 'sudo dnf install -y maven', 'sudo pacman -S --noconfirm maven'];
  }
  if (requirementKey === 'node') {
    if (platform === 'win32') return ['winget install OpenJS.NodeJS.LTS'];
    if (platform === 'darwin') return ['brew install node@22'];
    return ['sudo apt install -y nodejs npm', 'sudo dnf install -y nodejs npm', 'sudo pacman -S --noconfirm nodejs npm'];
  }
  return [];
}

function pathSnippets(npmGlobalBin, platform = process.platform) {
  if (!npmGlobalBin) return [];
  if (platform === 'win32') {
    return [
      `PowerShell (session): $env:Path = "${npmGlobalBin};" + $env:Path`,
      `To persist manually: add "${npmGlobalBin}" to your user PATH from Windows Environment Variables settings.`
    ];
  }
  return [
    `bash/zsh (session): export PATH="${npmGlobalBin}:$PATH"`,
    `fish (session): set -gx PATH "${npmGlobalBin}" $PATH`,
    `To persist manually: add this line to your shell config file: export PATH="${npmGlobalBin}:$PATH"`
  ];
}

export function collectSetupState() {
  const checks = [checkRequirement('node'), checkRequirement('java'), checkRequirement('maven')];
  const optional = [
    { key: 'bash', ok: hasCommand(process.platform === 'win32' ? 'bash.exe' : 'bash') },
    { key: 'curl', ok: hasCommand(process.platform === 'win32' ? 'curl.exe' : 'curl') }
  ];
  const npmPath = detectNpmGlobalBin();
  return { checks, optional, npmPath };
}

export function computeSuggestedActions(state, platform = process.platform) {
  const actions = [];
  for (const item of state.checks) {
    if (item.ok) continue;
    const commands = suggestedInstallCommands(item.key, platform);
    if (commands.length === 0) continue;
    actions.push({
      type: 'install',
      key: item.key,
      title: `Install ${item.key}`,
      commands
    });
  }
  if (state.npmPath.hasShimButNotOnPath) {
    actions.push({
      type: 'path',
      key: 'path',
      title: 'Fix npm global bin PATH',
      snippets: pathSnippets(state.npmPath.bin, platform)
    });
  }
  return actions;
}

function printSetupState(state) {
  console.log(pc.cyan('jwebgen setup diagnostics'));
  console.log(pc.cyan(`Platform: ${process.platform}`));
  for (const item of state.checks) {
    const marker = item.ok ? pc.green('OK') : pc.red('MISSING');
    console.log(`${marker} ${item.key}: ${item.display}`);
    if (!item.ok && item.hint) console.log(pc.yellow(`  Fix: ${item.hint}`));
  }
  for (const item of state.optional) {
    const marker = item.ok ? pc.green('OK') : pc.yellow('OPTIONAL');
    console.log(`${marker} ${item.key}`);
  }
}

export function runSetupCheck() {
  const state = collectSetupState();
  printSetupState(state);
  const failed = state.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.log(pc.red('Preflight failed: required tools are missing.'));
    return false;
  }
  if (state.npmPath.hasShimButNotOnPath) {
    console.log(pc.yellow('The global jwebgen shim exists but npm global bin is not currently in PATH.'));
  }
  console.log(pc.green('Preflight succeeded: required tools are available.'));
  return true;
}

function runCommand(command) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/c', command], { stdio: 'inherit' });
  }
  return spawnSync('sh', ['-lc', command], { stdio: 'inherit' });
}

export async function runSetupAssistant({ confirmPrompt, selectPrompt } = {}) {
  const state = collectSetupState();
  printSetupState(state);
  const actions = computeSuggestedActions(state);
  if (actions.length === 0) {
    const failed = state.checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      console.log(pc.red('No safe guided action is available for some checks. Resolve manually with the hints above.'));
      return false;
    }
    console.log(pc.green('No guided action required. Environment looks ready.'));
    return true;
  }

  console.log(pc.cyan('\nGuided setup actions (safe-by-default):'));
  for (const action of actions) {
    console.log(pc.cyan(`- ${action.title}`));
    if (action.type === 'install') {
      for (const cmd of action.commands) console.log(`  ${cmd}`);
    } else {
      console.log('  Manual PATH snippets:');
      for (const snippet of action.snippets) console.log(`  ${snippet}`);
    }
  }

  for (const action of actions) {
    if (action.type === 'path') {
      console.log(pc.yellow('\nPATH guidance (manual step, no file edits performed):'));
      for (const snippet of action.snippets) console.log(`  ${snippet}`);
      continue;
    }
    if (!confirmPrompt) continue;
    let command = action.commands[0];
    if (action.commands.length > 1 && selectPrompt) {
      const selected = await selectPrompt({
        message: `Choose install command for ${action.key}`,
        options: action.commands
      });
      if (selected) command = selected;
    }
    const approved = await confirmPrompt({
      message: `Run now for ${action.key}?`,
      initialValue: false
    });
    if (!approved) {
      console.log(pc.yellow(`Skipped ${action.key}.`));
      continue;
    }
    console.log(pc.cyan(`Executing: ${command}`));
    const result = runCommand(command);
    if (result.status !== 0) {
      console.log(pc.red(`Command failed for ${action.key}. Please run manually or try another package manager command.`));
    }
  }

  const nextState = collectSetupState();
  console.log(pc.cyan('\nPost-action verification:'));
  printSetupState(nextState);
  const failed = nextState.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.log(pc.red('Setup assistant finished with remaining missing dependencies.'));
    return false;
  }
  console.log(pc.green('Setup assistant completed successfully.'));
  return true;
}

export function enforceActionPreflight(action) {
  const requirements = getActionRequirements(action);
  if (requirements.length === 0) return;
  const failed = requirements
    .map((key) => checkRequirement(key))
    .filter((item) => !item.ok);
  if (failed.length === 0) return;
  console.error(pc.red(`Cannot run "${action}" because required dependencies are missing or incompatible.`));
  for (const item of failed) {
    console.error(pc.yellow(`- ${item.key}: ${item.display}`));
    if (item.hint) console.error(pc.yellow(`  Fix: ${item.hint}`));
  }
  process.exit(1);
}
