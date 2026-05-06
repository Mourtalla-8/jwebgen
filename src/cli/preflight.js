import pc from 'picocolors';
import { spawnSync } from 'node:child_process';
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

export function runSetupCheck() {
  const checks = [checkRequirement('node'), checkRequirement('java'), checkRequirement('maven')];
  const optional = [
    { key: 'bash', ok: hasCommand(process.platform === 'win32' ? 'bash.exe' : 'bash') },
    { key: 'curl', ok: hasCommand(process.platform === 'win32' ? 'curl.exe' : 'curl') }
  ];
  console.log(pc.cyan('jwebgen setup diagnostics'));
  console.log(pc.cyan(`Platform: ${process.platform}`));
  for (const item of checks) {
    const marker = item.ok ? pc.green('OK') : pc.red('MISSING');
    console.log(`${marker} ${item.key}: ${item.display}`);
    if (!item.ok && item.hint) console.log(pc.yellow(`  Fix: ${item.hint}`));
  }
  for (const item of optional) {
    const marker = item.ok ? pc.green('OK') : pc.yellow('OPTIONAL');
    console.log(`${marker} ${item.key}`);
  }
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.log(pc.red('Preflight failed: required tools are missing.'));
    return false;
  }
  console.log(pc.green('Preflight succeeded: required tools are available.'));
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
