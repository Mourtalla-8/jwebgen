import pc from 'picocolors';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectJavaCompiler, evaluateJavaCompatibility, installHint, which } from '../project/inputUtils.js';
import { windowsMavenPortableInstallShellCommand } from '../project/windowsSetupInstall.js';

export const CANCEL_STEP = '__JWEBGEN_CANCEL_STEP__';
export const SKIP_ACTION = '__JWEBGEN_SKIP_ACTION__';

class SetupCancelledError extends Error {
  constructor(message = 'Setup cancelled.') {
    super(message);
    this.name = 'SetupCancelledError';
    this.exitCode = 130;
    this.jwebgenHandled = true;
  }
}

function hasCommand(binary) {
  if (which(binary)) return true;
  const probe = process.platform === 'win32' ? spawnSync('where', [binary], { stdio: 'ignore' }) : spawnSync('which', [binary], { stdio: 'ignore' });
  return probe.status === 0;
}

function detectAvailablePackageManagers(platform = process.platform, hasCommandImpl = hasCommand) {
  if (platform === 'win32') {
    return {
      winget: hasCommandImpl('winget')
    };
  }
  if (platform === 'darwin') {
    return {
      brew: hasCommandImpl('brew')
    };
  }
  // default: linux/other unix
  const apt = hasCommandImpl('apt-get') || hasCommandImpl('apt');
  return {
    apt,
    dnf: hasCommandImpl('dnf'),
    pacman: hasCommandImpl('pacman')
  };
}

function filterInstallCommandsForEnvironment(commands = [], { platform = process.platform, hasCommandImpl = hasCommand } = {}) {
  const pm = detectAvailablePackageManagers(platform, hasCommandImpl);
  const bashOk = platform === 'win32' ? hasCommandImpl('bash.exe') : hasCommandImpl('bash');
  const curlOk = platform === 'win32' ? hasCommandImpl('curl.exe') : hasCommandImpl('curl');

  const allow = (cmd) => {
    const c = String(cmd || '');
    const lower = c.toLowerCase();
    // Package manager gating (Windows: winget installs + encoded portable Maven via PowerShell)
    if (platform === 'win32') {
      const trimmed = c.trimStart();
      if (/^powershell(\.exe)?\b/i.test(trimmed)) {
        return hasCommandImpl('powershell') || hasCommandImpl('powershell.exe');
      }
      return Boolean(pm.winget) && /\bwinget\b/i.test(c);
    }
    if (platform === 'darwin') return Boolean(pm.brew) && /\bbrew\b/i.test(c);

    // linux/unix
    if (/\bpacman\b/i.test(c)) return Boolean(pm.pacman);
    if (/\bdnf\b/i.test(c)) return Boolean(pm.dnf);
    if (/\bapt-get\b/i.test(c) || /\bapt\b/i.test(c)) return Boolean(pm.apt);

    // Tooling constraints (e.g. NodeSource curl | bash | apt-get)
    if (lower.includes('curl ') || lower.includes('curl\t') || lower.includes('curl -')) {
      if (!curlOk) return false;
    }
    if (lower.includes('|') && lower.includes('bash')) {
      if (!bashOk) return false;
    }
    return true;
  };

  return Array.isArray(commands) ? commands.filter(allow) : [];
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

function normalizePathForCompare(inputPath) {
  const normalized = path.normalize(String(inputPath || ''));
  const trimmed = normalized.replace(/[\\/]+$/, '');
  if (process.platform === 'win32') return trimmed.toLowerCase();
  return trimmed;
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
  const normalizedBin = normalizePathForCompare(bin);
  const normalizedPathEntries = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => normalizePathForCompare(entry));
  const shimCandidates = process.platform === 'win32'
    ? ['jwebgen', 'jwebgen.cmd', 'jwebgen.ps1', 'jwebgen.exe']
    : ['jwebgen'];
  const hasShimInBin = bin && shimCandidates.some((name) => existsSync(path.join(bin, name)));
  const inPath = Boolean(normalizedBin) && normalizedPathEntries.includes(normalizedBin);
  const hasShimButNotOnPath = Boolean(hasShimInBin && !inPath);
  const resolvedOutsideBin = Boolean(!hasShimInBin && commandExistsInPath('jwebgen'));
  return {
    bin,
    prefix,
    hasBin: Boolean(bin),
    inPath,
    jwebgenReachable: commandExistsInPath('jwebgen'),
    hasShimInBin: Boolean(hasShimInBin),
    hasShimButNotOnPath,
    resolvedOutsideBin
  };
}

const INSTALL_MATRIX = {
  java: {
    win32: {
      installCommands: [
        'winget install EclipseAdoptium.Temurin.21.JDK',
        'winget install Microsoft.OpenJDK.21'
      ],
      failureHint:
        'Retry with winget as Administrator if needed, then close and reopen the terminal (or VS Code) and run javac -version or jwebgen --setup --dry-run.'
    },
    darwin: {
      installCommands: ['brew install --cask temurin'],
      failureHint: 'Retry with Homebrew, then open a new terminal and re-run jwebgen --setup --dry-run.'
    },
    default: {
      installCommands: [
        'sudo apt install -y default-jdk',
        'sudo dnf install -y java-21-openjdk-devel',
        'sudo pacman -S --noconfirm jdk-openjdk'
      ]
    }
  },
  maven: {
    win32: {
      installCommands: [windowsMavenPortableInstallShellCommand()],
      failureHint:
        'If the script failed, check the output above. After a successful run, close and reopen the terminal (or VS Code), then run mvn -version or jwebgen --setup --dry-run.'
    },
    darwin: {
      installCommands: ['brew install maven'],
      failureHint: 'Retry with Homebrew, then open a new terminal and re-run jwebgen --setup --dry-run.'
    },
    default: {
      installCommands: ['sudo apt install -y maven', 'sudo dnf install -y maven', 'sudo pacman -S --noconfirm maven']
    }
  },
  node: {
    win32: {
      installCommands: ['winget install OpenJS.NodeJS.LTS'],
      failureHint: 'Retry with winget as Administrator, then restart terminal and run jwebgen --setup --dry-run.'
    },
    darwin: {
      installCommands: ['brew install node@22'],
      failureHint: 'Retry with Homebrew, then open a new terminal and re-run jwebgen --setup --dry-run.'
    },
    default: {
      installCommands: [
        'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
        'sudo dnf install -y nodejs npm',
        'sudo pacman -S --noconfirm nodejs npm'
      ]
    }
  }
};

function suggestedInstallCommands(requirementKey, platform = process.platform) {
  const entry = INSTALL_MATRIX[requirementKey];
  if (!entry) return [];
  return entry[platform]?.installCommands || entry.default?.installCommands || [];
}

export function buildInstallFailureHint(requirementKey, platform = process.platform) {
  const entry = INSTALL_MATRIX[requirementKey];
  const hint = entry?.[platform]?.failureHint || entry?.default?.failureHint;
  if (hint) return hint;
  return 'Retry with your package manager command, then re-run jwebgen --setup --dry-run.';
}

function pathSnippets(npmGlobalBin, platform = process.platform) {
  if (!npmGlobalBin) return [];
  if (platform === 'win32') {
    return [
      `PowerShell (session): $env:Path = "${npmGlobalBin};" + $env:Path`,
      'Rollback (session): restart terminal, or set $env:Path back to previous value in this session.',
      `To persist manually: add "${npmGlobalBin}" to your user PATH from Windows Environment Variables settings.`
    ];
  }
  return [
    `bash/zsh (session): export PATH="${npmGlobalBin}:$PATH"`,
    `fish (session): set -gx PATH "${npmGlobalBin}" $PATH`,
    'Rollback (session): close terminal, or restore PATH to previous session value.',
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

export function computeSuggestedActions(state, platform = process.platform, { hasCommandImpl = hasCommand } = {}) {
  const actions = [];
  for (const item of state.checks) {
    if (item.ok) continue;
    const commands = filterInstallCommandsForEnvironment(suggestedInstallCommands(item.key, platform), {
      platform,
      hasCommandImpl
    });
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
  if (state.npmPath.hasShimButNotOnPath && state.npmPath.bin) {
    console.log(
      pc.yellow(
        `npm global folder is not on PATH (jwebgen was installed with npm -g). Add this folder to PATH: ${state.npmPath.bin}`
      )
    );
  }
}

export function runSetupCheck({ dryRun = false } = {}) {
  const state = collectSetupState();
  printSetupState(state);
  const failed = state.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.log(pc.red('Preflight failed: required tools are missing.'));
    return false;
  }
  console.log(pc.green('Preflight succeeded: required tools are available.'));
  return true;
}

function capText(input, cap = 200_000) {
  const text = String(input || '');
  if (text.length <= cap) return text;
  return text.slice(-cap);
}

function tailLines(text, maxLines = 80, maxChars = 8000) {
  const capped = capText(text, Math.max(maxChars, 50_000));
  const lines = capped.split(/\r?\n/);
  const tail = lines.slice(-maxLines).join('\n');
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}

async function runCommand(command, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-lc', command];
  try {
    const child = spawn(shell, shellArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const onStdout = (c) => {
      stdout = capText(stdout + String(c));
    };
    const onStderr = (c) => {
      stderr = capText(stderr + String(c));
    };
    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);

    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    killTimer.unref?.();

    let interrupted = false;
    const onSigint = () => {
      interrupted = true;
      try {
        child.kill('SIGINT');
      } catch {
        /* ignore */
      }
    };
    process.once('SIGINT', onSigint);

    const { code, signal } = await new Promise((resolve) => {
      child.on('exit', (code, signal) => resolve({ code, signal }));
      child.on('error', () => resolve({ code: 1, signal: null }));
    });
    process.off('SIGINT', onSigint);
    clearTimeout(killTimer);

    return {
      status: code ?? 1,
      signal: interrupted ? 'SIGINT' : signal || null,
      timedOut,
      error: null,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      status: 1,
      signal: null,
      timedOut: error?.code === 'ETIMEDOUT',
      error,
      stdout: '',
      stderr: ''
    };
  }
}

export async function runSetupAssistant({
  confirmPrompt,
  selectPrompt,
  dryRun = false,
  runCommandImpl = runCommand,
  collectSetupStateImpl = collectSetupState,
  computeSuggestedActionsImpl = computeSuggestedActions,
  verbose = false,
  onCommandStart,
  onCommandEnd
} = {}) {
  const state = collectSetupStateImpl();
  printSetupState(state);
  const actions = computeSuggestedActionsImpl(state);
  if (actions.length === 0) {
    const failed = state.checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      console.log(pc.red('No safe guided action is available for some checks. Resolve manually with the hints above.'));
      return false;
    }
    console.log(pc.green('No guided action required. Environment looks ready.'));
    return true;
  }

  console.log(pc.cyan('\nGuided setup actions:'));
  for (const action of actions) {
    console.log(pc.cyan(`- ${action.title}`));
    if (action.type === 'install') {
      const best = action.commands[0] || '';
      const alternatives = Math.max(0, action.commands.length - 1);
      if (best) console.log(`  ${best}`);
      if (alternatives > 0) console.log(pc.cyan(`  (alternatives available: ${alternatives})`));
    } else {
      console.log('  Manual PATH snippets:');
      for (const snippet of action.snippets) console.log(`  ${snippet}`);
    }
  }

  if (dryRun) return true;

  let pendingWinSessionRefresh = false;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
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
      if (selected === CANCEL_STEP) {
        if (i === 0) throw new SetupCancelledError();
        i = Math.max(-1, i - 2);
        continue;
      }
      if (selected === SKIP_ACTION) {
        console.log(pc.yellow(`Skipped ${action.key}.`));
        continue;
      }
      if (selected) command = selected;
    }
    const approved = await confirmPrompt({
      message: `Run now for ${action.key}?`,
      initialValue: false
    });
    if (approved === CANCEL_STEP) {
      if (i === 0) throw new SetupCancelledError();
      i = Math.max(-1, i - 2);
      continue;
    }
    if (!approved) {
      console.log(pc.yellow(`Skipped ${action.key}.`));
      continue;
    }
    console.log(pc.cyan(`Executing: ${command}`));
    if (typeof onCommandStart === 'function') {
      try {
        onCommandStart({ key: action.key, command });
      } catch {
        /* ignore */
      }
    }
    let result;
    try {
      result = await runCommandImpl(command);
    } catch (error) {
      result = { status: 1, timedOut: error?.code === 'ETIMEDOUT', error, signal: null };
    }
    if (typeof onCommandEnd === 'function') {
      try {
        onCommandEnd({ key: action.key, command, result });
      } catch {
        /* ignore */
      }
    }
    if (result?.signal === 'SIGINT') {
      throw new SetupCancelledError();
    }
    if (result.status !== 0) {
      if (result.timedOut) {
        console.log(pc.red(`Command timed out for ${action.key}.`));
      } else if (result.error) {
        console.log(pc.red(`Command execution error for ${action.key}: ${result.error.message || result.error}`));
      } else {
        console.log(pc.red(`Command failed for ${action.key} (exit ${result.status}).`));
      }
      if (!verbose) {
        const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        const excerpt = tailLines(combined);
        if (excerpt) {
          console.log(pc.yellow('\nLast output (tail):'));
          console.log(excerpt);
        }
      } else {
        const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        if (combined) console.log(combined);
      }
      console.log(pc.yellow(`Remediation: ${buildInstallFailureHint(action.key)}`));
    } else {
      const recheckState = collectSetupStateImpl();
      const check = recheckState.checks.find((item) => item.key === action.key);
      if (check?.ok) {
        console.log(pc.green(`Verification after ${action.key}: ${check.display}`));
      } else if (check) {
        const winTooling =
          process.platform === 'win32' && (action.key === 'java' || action.key === 'maven' || action.key === 'node');
        if (winTooling) {
          console.log(
            pc.yellow(
              `Install for ${action.key} finished, but this session still sees: ${check.display}. On Windows, close and reopen the terminal (or VS Code), then run java -version, mvn -version, or jwebgen --setup --dry-run to confirm.`
            )
          );
          pendingWinSessionRefresh = true;
        } else {
          console.log(pc.yellow(`Verification after ${action.key}: still missing/incompatible (${check.display}).`));
        }
      }
    }
  }

  const nextState = collectSetupStateImpl();
  const failed = nextState.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    if (pendingWinSessionRefresh && process.platform === 'win32') {
      console.log(
        pc.yellow(
          '\nReminder: PATH changes from installers apply to new terminal sessions. Close and reopen the terminal (or VS Code), then run jwebgen --setup --dry-run to verify.'
        )
      );
    }
    const summary = failed.map((c) => `${c.key}: ${c.display}`).join('; ');
    console.log(pc.red(`Setup finished with missing or incompatible tools: ${summary}`));
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
