import pc from 'picocolors';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectJavaCompiler, evaluateJavaCompatibility, installHint, which } from '../project/inputUtils.js';
import { looksLikeWildflyHome, probeApacheTomcatHome, resolveWildflyPaths, validateWildflyDeploymentsPath } from '../project/serverPaths.js';
import {
  describeFirstResolvedSystemdUnit,
  describeWindowsTomcatService,
  describeWindowsWildflyService,
  isDirWritableByProcess,
  runTomcatCatalinaVersion,
  runWildflyCliVersion
} from '../project/serverRuntimeProbe.js';
import {
  runWindowsMavenPortableInstall,
  runWindowsTomcatPortableInstall,
  runWindowsWildflyPortableInstall,
  WINDOWS_MAVEN_PORTABLE_VERSION,
  WINDOWS_TOMCAT_PORTABLE_VERSION,
  WINDOWS_WILDFLY_PORTABLE_VERSION
} from '../project/windowsSetupInstall.js';
import {
  commandPreviewForInstallMethod,
  filterInstallMethods,
  getInstallMethodsForKey
} from './installMatrix.js';

export const CANCEL_STEP = '__JWEBGEN_CANCEL_STEP__';
export const SKIP_ACTION = '__JWEBGEN_SKIP_ACTION__';

const SESSION_HINT = `Some installed tools may require a new shell/session before becoming available.
Reopen your terminal or app session, then run:
- java -version
- mvn --version
or:
- jwebgen --setup --dry-run`;

export class SetupCancelledError extends Error {
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

/** Avoid Node DEP0190 (spawn + shell:true + args): run .cmd via cmd.exe /c without shell option. */
function spawnMavenVersionProbe(binName) {
  if (process.platform === 'win32' && /\.cmd$/i.test(binName)) {
    return spawnSync('cmd.exe', ['/d', '/c', binName, '--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
  }
  return spawnSync(binName, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function verifyMavenCli(binName) {
  if (!binName) return false;
  const result = spawnMavenVersionProbe(binName);
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return !result.error && result.status === 0 && /\bApache\s+Maven\b/i.test(text);
}

/** @returns {{ line: string, home: string }} */
function mavenSetupDisplay(binName) {
  if (!binName) return { line: '', home: '' };
  const result = spawnMavenVersionProbe(binName);
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error || result.status !== 0 || !/\bApache\s+Maven\b/i.test(text)) return { line: '', home: '' };
  const lines = text.split(/\r?\n/).filter(Boolean);
  const hit = lines.find((l) => /\bApache\s+Maven\b/i.test(l));
  let line = String(hit ?? lines[0] ?? '').trim();
  line = line.replace(/\s*\([0-9a-f]{7,40}\)/i, '');
  const hm = text.match(/Maven home:\s*(\S[^\r\n]*)/i);
  const home = hm ? hm[1].trim() : '';
  return { line, home };
}

function getActionRequirements(action) {
  if (action === 'create') return ['java', 'maven'];
  if (action === 'build') return ['java', 'maven'];
  if (action === 'deploy' || action === 'dev' || action === 'servlet' || action === 'jsp') return ['java', 'maven'];
  return [];
}

function checkTomcatRequirement(platform = process.platform) {
  const probe = probeApacheTomcatHome({ platform });
  const detailLines = [];
  if (!probe.ok || !probe.home) {
    let display = 'not installed';
    if (!probe.ok && probe.probe === 'env' && probe.home) {
      display = `not usable at ${probe.home} (needs Apache Tomcat: lib/catalina.jar + bin/bootstrap.jar + catalina launcher)`;
    }
    return {
      key: 'tomcat',
      ok: false,
      display,
      hint: installHint('tomcat'),
      detailLines
    };
  }
  const home = probe.home;
  const webapps = path.join(home, 'webapps');
  if (existsSync(webapps) && !isDirWritableByProcess(webapps)) {
    detailLines.push('webapps dir is not writable by this user (packaged Tomcat often needs sudo or ACL changes to deploy)');
  }
  if (platform === 'linux') {
    const svc = describeFirstResolvedSystemdUnit(['tomcat10', 'tomcat']);
    if (svc) detailLines.push(`systemd ${svc.unit}: ${svc.state}`);
  } else if (platform === 'win32') {
    const ws = describeWindowsTomcatService();
    if (ws) detailLines.push(`Windows service "${ws.name}": ${ws.state}`);
  }
  const ver = runTomcatCatalinaVersion(home, platform);
  if (!ver.ok) {
    return {
      key: 'tomcat',
      ok: false,
      display: `not usable at ${home}: ${ver.reason || 'catalina version check failed'}`,
      hint: installHint('tomcat'),
      detailLines
    };
  }
  const label =
    probe.probe === 'detected'
      ? `Tomcat at ${home} (auto-detected)`
      : `Tomcat at ${home}`;
  const display = ver.line ? `${label} · ${ver.line}` : label;
  return {
    key: 'tomcat',
    ok: true,
    display,
    hint: '',
    detailLines
  };
}

function checkWildflyRequirement(platform = process.platform) {
  const { wildflyHome, deployments } = resolveWildflyPaths({ platform });
  const depValidation = deployments ? validateWildflyDeploymentsPath(deployments) : { ok: false };
  const depPath = depValidation.ok ? depValidation.resolved : '';
  const depExists = Boolean(depValidation.ok && depPath && existsSync(depPath));
  const homeLooks = wildflyHome && looksLikeWildflyHome(wildflyHome);
  const detailLines = [];

  if (!homeLooks || !depExists || !deployments) {
    let display = 'not installed';
    if (wildflyHome && !homeLooks) {
      display = `not usable at ${wildflyHome} (needs WildFly unzip: jboss-modules.jar under WILDFLY_HOME)`;
    }
    return {
      key: 'wildfly',
      ok: false,
      display,
      hint: installHint('wildfly'),
      detailLines
    };
  }

  if (depPath && !isDirWritableByProcess(depPath)) {
    detailLines.push('deployments dir is not writable by this user (deploy may need sudo or a writable standalone dir)');
  }
  if (platform === 'linux') {
    const svc = describeFirstResolvedSystemdUnit(['wildfly']);
    if (svc) detailLines.push(`systemd ${svc.unit}: ${svc.state}`);
  } else if (platform === 'win32') {
    const ws = describeWindowsWildflyService();
    if (ws) detailLines.push(`Windows service "${ws.name}": ${ws.state}`);
  }
  const cli = runWildflyCliVersion(wildflyHome, platform);
  if (!cli.ok) {
    return {
      key: 'wildfly',
      ok: false,
      display: `not usable at ${wildflyHome}: ${cli.reason || 'jboss-cli check failed'}`,
      hint: installHint('wildfly'),
      detailLines
    };
  }
  const label = `WildFly at ${wildflyHome}`;
  const display = cli.line ? `${label} · ${cli.line}` : label;
  return {
    key: 'wildfly',
    ok: true,
    display,
    hint: '',
    detailLines
  };
}

export function checkRequirement(req) {
  if (req === 'java') {
    const java = detectJavaCompiler();
    if (!java.present) {
      if (java.jreOnly) {
        return {
          key: 'java',
          ok: false,
          display: java.display || 'JRE without javac',
          hint: `Install a JDK (includes javac). ${installHint('java')}`
        };
      }
      return { key: 'java', ok: false, display: 'not installed', hint: installHint('java') };
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
    const mavenBin = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
    const fallbackBin = mavenBin === 'mvn.cmd' ? 'mvn' : '';
    let ok = verifyMavenCli(mavenBin);
    let displayLine = '';
    if (!ok && fallbackBin) ok = verifyMavenCli(fallbackBin);
    if (ok) {
      let parts = mavenSetupDisplay(mavenBin);
      if (!parts.line && fallbackBin) parts = mavenSetupDisplay(fallbackBin);
      displayLine =
        parts.line
          ? (parts.home ? `${parts.line} · ${parts.home}` : parts.line)
          : 'Maven available';
    }
    return {
      key: 'maven',
      ok,
      display: ok ? displayLine : 'not installed',
      hint: ok ? '' : installHint('maven')
    };
  }
  if (req === 'tomcat') {
    return checkTomcatRequirement();
  }
  if (req === 'wildfly') {
    return checkWildflyRequirement();
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
  const checks = [
    checkRequirement('java'),
    checkRequirement('maven'),
    checkRequirement('tomcat'),
    checkRequirement('wildfly')
  ];
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
    const installMethods = resolveInstallMethods(item.key, platform, hasCommandImpl);
    if (installMethods.length === 0) continue;
    actions.push({
      type: 'install',
      key: item.key,
      title: `Install ${item.key}`,
      installMethods
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

export function resolveInstallMethods(key, platform = process.platform, hasCommandImpl = hasCommand) {
  const raw = getInstallMethodsForKey(key, platform);
  return filterInstallMethods(raw, platform, hasCommandImpl);
}

/** @param {{ includeFixHints?: boolean, includeNpmPathNote?: boolean }} [opts] */
export function printSetupState(state, { includeFixHints = false, includeNpmPathNote = true } = {}) {
  console.log(pc.cyan('jwebgen setup diagnostics'));
  console.log(pc.cyan(`Platform: ${process.platform}`));
  for (const item of state.checks) {
    const marker = item.ok ? pc.green('OK') : pc.red('MISSING');
    if (!item.ok) {
      if (item.display && item.display !== 'not installed') {
        console.log(`${marker} ${item.key}: ${item.display}`);
      } else {
        console.log(`${marker} ${item.key}`);
      }
    } else if (
      ['java', 'maven', 'tomcat', 'wildfly'].includes(item.key)
      && item.display
      && item.display !== 'not installed'
    ) {
      console.log(`${marker} ${item.key}: ${item.display}`);
    } else {
      console.log(`${marker} ${item.key}`);
    }
    if (item.detailLines?.length) {
      for (const line of item.detailLines) {
        if (line) console.log(pc.dim(`    ${line}`));
      }
    }
    if (includeFixHints && !item.ok && item.hint) console.log(pc.yellow(`  Fix: ${item.hint}`));
  }
  if (includeNpmPathNote && state.npmPath.hasShimButNotOnPath && state.npmPath.bin) {
    console.log(
      pc.yellow(
        `npm global folder is not on PATH (jwebgen was installed with npm -g). Add this folder to PATH: ${state.npmPath.bin}`
      )
    );
  }
}

function printDryRunInstallPreviews(actions) {
  const installActions = actions.filter((a) => a.type === 'install');
  if (installActions.length === 0) return;
  console.log(pc.cyan('\nGuided setup actions:'));
  for (const action of installActions) {
    console.log(pc.cyan(`- Install ${action.key}`));
    for (const m of action.installMethods) {
      if (m.label) console.log(`  - ${m.label}`);
      const command = commandPreviewForInstallMethod(m, action.key);
      if (command) console.log(`    ${command}`);
    }
  }
}

/** Non-interactive setup diagnostics. */
export function runSetupCheck({ dryRun = false } = {}) {
  const state = collectSetupState();
  printSetupState(state, { includeFixHints: false, includeNpmPathNote: !dryRun });
  const actions = computeSuggestedActions(state);
  if (dryRun) {
    printDryRunInstallPreviews(actions);
  }
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

/** Strip noisy PowerShell wrapper lines from captured install output (user-facing). */
function sanitizeInstallOutputLog(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      if (/^Processing\s+-File\b/i.test(l)) return false;
      if (/^Illegal characters in path\.?$/i.test(l)) return false;
      return true;
    });
  return lines.join('\n').trim();
}

export async function runCommand(command, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-lc', command];
  const useInheritStdio =
    process.platform !== 'win32'
    && /(^|[\s;|&])sudo(\s|$)/.test(command)
    && process.stdin.isTTY
    && process.stdout.isTTY
    && process.stderr.isTTY;
  const stdio = useInheritStdio ? 'inherit' : (/** @type {const} */ (['ignore', 'pipe', 'pipe']));
  try {
    const child = spawn(shell, shellArgs, { stdio });
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
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    killTimer.unref?.();

    let interrupted = false;
    const onSigint = () => {
      interrupted = true;
      try {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          child.kill('SIGINT');
        }
      } catch {
        /* ignore */
      }
    };
    process.once('SIGINT', onSigint);

    const { code, signal } = await new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
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

function isWingetNoOpSuccess(result, method) {
  if (!method?.shellCommand || !/\bwinget\b/i.test(method.shellCommand)) return false;
  if (!result || result.status === 0) return false;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return (
    /found an existing package already installed/i.test(output)
    || /no available upgrade found/i.test(output)
    || /no newer package versions are available/i.test(output)
  );
}

function normalizeInstallResult(result, method) {
  if (isWingetNoOpSuccess(result, method)) {
    return { ...result, status: 0, signal: null, error: null, timedOut: false };
  }
  return result;
}

function getInstallLocationForTool(tool) {
  if (process.platform !== 'win32') return '';
  const drive = String(process.env.SystemDrive || 'C:').replace(/[/\\]+$/, '');
  const jwebgenRoot = path.join(`${drive}${path.sep}`, 'jwebgen');
  if (tool === 'maven') return path.join(jwebgenRoot, `apache-maven-${WINDOWS_MAVEN_PORTABLE_VERSION}`);
  if (tool === 'tomcat') return path.join(jwebgenRoot, `apache-tomcat-${WINDOWS_TOMCAT_PORTABLE_VERSION}`);
  if (tool === 'wildfly') return path.join(jwebgenRoot, `wildfly-${WINDOWS_WILDFLY_PORTABLE_VERSION}`);
  return '';
}

function printInstallDone(tool) {
  console.log(pc.green('Done'));
  const location = getInstallLocationForTool(tool);
  if (location) {
    console.log('Installed to:');
    console.log(location);
  }
}

function resolvePrimaryInstallMethod(tool, platform, runCommandImpl) {
  const methods = resolveInstallMethods(tool, platform, hasCommand);
  const resolved = methods[0] || null;
  if (!resolved) {
    return null;
  }
  return { method: resolved, runCommandImpl };
}

async function executeInstallMethod(tool, method, runCommandImpl) {
  if (method.internalId === 'maven-windows-portable') {
    return runWindowsMavenPortableInstall();
  }
  if (method.internalId === 'tomcat-windows-portable') {
    return runWindowsTomcatPortableInstall();
  }
  if (method.internalId === 'wildfly-windows-portable') {
    return runWindowsWildflyPortableInstall();
  }
  if (method.shellCommand) {
    const result = await runCommandImpl(method.shellCommand);
    return normalizeInstallResult(result, method);
  }
  return { status: 1, timedOut: false, error: new Error('No install method'), signal: null, stdout: '', stderr: '' };
}

/**
 * Non-interactive install used by `jwebgen --install <tool>`.
 * @param {string} tool
 * @param {{ runCommandImpl?: typeof runCommand }} [opts]
 * @returns {Promise<number>} process exit code
 */
export async function runInstallTool(tool, { runCommandImpl = runCommand } = {}) {
  const platform = process.platform;
  const check = checkRequirement(tool);
  if (check.ok) {
    console.log(pc.green(`${tool} already satisfied.`));
    return 0;
  }
  const primary = resolvePrimaryInstallMethod(tool, platform, runCommandImpl);
  if (!primary?.method) {
    console.error(pc.red(`No install method is available for ${tool} on this system.`));
    return 1;
  }
  const result = await executeInstallMethod(tool, primary.method, runCommandImpl);
  if (result?.signal === 'SIGINT') return 130;
  if (result.status !== 0) {
    console.error(pc.red(`Install failed for ${tool}.`));
    if (result.stderr || result.stdout) {
      const raw = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const cleaned = sanitizeInstallOutputLog(raw);
      const tail = tailLines(cleaned);
      if (tail) console.error(tail);
    }
    return 1;
  }
  printInstallDone(tool);
  return 0;
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
  printSetupState(state, { includeFixHints: false, includeNpmPathNote: !dryRun });
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

  if (dryRun) {
    printDryRunInstallPreviews(actions);
    const failedChecks = state.checks.filter((c) => !c.ok);
    if (failedChecks.length === 0) return true;
    const installableKeys = new Set(actions.filter((a) => a.type === 'install').map((a) => a.key));
    return failedChecks.every((c) => installableKeys.has(c.key));
  }

  console.log(pc.cyan('\nGuided setup actions:'));
  for (const action of actions) {
    console.log(pc.cyan(`- ${action.title}`));
  }

  let anyInstallExitOk = false;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.type === 'path') {
      console.log(pc.yellow('\nPATH guidance (manual step, no file edits performed):'));
      for (const snippet of action.snippets) console.log(`  ${snippet}`);
      continue;
    }
    if (!confirmPrompt) continue;

    const methodOptions = action.installMethods.map((m) => ({ value: m.id, label: m.label }));
    let chosenId = methodOptions[0]?.value;
    if (selectPrompt && methodOptions.length > 0) {
      const selected = await selectPrompt({
        message: `Choose install method for ${action.key}`,
        options: [{ value: SKIP_ACTION, label: 'None' }, ...methodOptions]
      });
      if (selected === CANCEL_STEP) {
        if (i === 0) throw new SetupCancelledError();
        i = Math.max(-1, i - 2);
        continue;
      }
      if (selected === SKIP_ACTION || selected == null) {
        console.log(pc.yellow(`Skipped ${action.key}.`));
        continue;
      }
      chosenId = selected;
    }
    const method = action.installMethods.find((m) => m.id === chosenId);
    if (!method) {
      console.log(pc.yellow(`Skipped ${action.key}.`));
      continue;
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

    if (typeof onCommandStart === 'function') {
      try {
        onCommandStart({ key: action.key });
      } catch {
        /* ignore */
      }
    }
    let result;
    try {
      result = await executeInstallMethod(action.key, method, runCommandImpl);
    } catch (error) {
      result = { status: 1, timedOut: error?.code === 'ETIMEDOUT', error, signal: null };
    }
    if (typeof onCommandEnd === 'function') {
      try {
        onCommandEnd({ key: action.key, result });
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
        const combined = sanitizeInstallOutputLog([result.stdout, result.stderr].filter(Boolean).join('\n').trim());
        const excerpt = tailLines(combined);
        if (excerpt) {
          console.log(pc.yellow('\nLast output (tail):'));
          console.log(excerpt);
        }
      } else {
        const combined = sanitizeInstallOutputLog([result.stdout, result.stderr].filter(Boolean).join('\n').trim());
        if (combined) console.log(combined);
      }
    } else {
      anyInstallExitOk = true;
      printInstallDone(action.key);
    }
  }

  const nextState = collectSetupStateImpl();
  const failed = nextState.checks.filter((c) => !c.ok);
  if (anyInstallExitOk) {
    console.log(pc.yellow(`\n${SESSION_HINT}`));
  }
  if (failed.length > 0) {
    const summary = failed.map((c) => c.key).join(', ');
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
    console.error(pc.yellow(`- ${item.key}`));
    if (item.hint) console.error(pc.yellow(`  Fix: ${item.hint}`));
  }
  process.exit(1);
}
