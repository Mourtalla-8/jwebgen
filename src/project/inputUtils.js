import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function slugifyArtifactId(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function normalizePackageCandidate(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[-_]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function sanitizePackageSegment(input) {
  const raw = String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!raw) return '';
  if (/^[a-z_]/.test(raw)) return raw;
  return `p${raw}`;
}

export function sanitizePackage(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[-_]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .split('.')
    .map(sanitizePackageSegment)
    .filter(Boolean)
    .join('.');
}

export function packageToPath(input) {
  return String(input)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(path.sep);
}

export function artifactPackagePart(artifactId) {
  const cleaned = String(artifactId)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!cleaned) return 'app';
  if (/^[a-z_]/.test(cleaned)) return cleaned;
  return `p${cleaned}`;
}

export function expandHome(input) {
  const raw = String(input).trim();
  if (!raw) return raw;
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2));
  if (raw.startsWith('~\\')) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

export function parseJavaMajorRelease(versionText) {
  const raw = String(versionText).trim();
  if (!raw) return null;
  const legacy = raw.match(/^1\.(\d+)(?:[._-].*)?$/);
  if (legacy) return Number.parseInt(legacy[1], 10);
  const modern = raw.match(/^(\d+)(?:[._-].*)?$/);
  if (modern) return Number.parseInt(modern[1], 10);
  return null;
}

function parseJavacProbeOutput(result) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (!output || result.error || result.status !== 0) return null;
  const versionMatch = output.match(/\bjavac\s+([^\s"]+)/i) || output.match(/version "([^"]+)"/i);
  const rawVersion = versionMatch ? versionMatch[1] : output;
  const majorRelease = parseJavaMajorRelease(rawVersion);
  return { rawVersion, majorRelease };
}

function javacPresentResult(parsed) {
  const { rawVersion, majorRelease } = parsed;
  return {
    present: true,
    rawVersion,
    majorRelease,
    display: majorRelease ? `JDK ${majorRelease} (${rawVersion})` : rawVersion,
    jreOnly: false
  };
}

const JRE_ONLY_DISPLAY =
  'JRE or incomplete JDK: javac not found (install a JDK or add JAVA_HOME/bin to PATH)';

/** @returns {{ present: false, rawVersion: string|null, majorRelease: number|null, display: string, jreOnly: true } | null} */
function jreOnlyFromJavaProbe(javaExecutable) {
  const jr = spawnSync(javaExecutable, ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const jout = `${jr.stdout ?? ''}${jr.stderr ?? ''}`.trim();
  if (jr.error || jr.status !== 0 || !jout) return null;
  const vm = jout.match(/version "([^"]+)"/i);
  const rawVersion = vm ? vm[1] : null;
  const majorRelease = rawVersion ? parseJavaMajorRelease(rawVersion) : null;
  return {
    present: false,
    rawVersion,
    majorRelease,
    display: JRE_ONLY_DISPLAY,
    jreOnly: true
  };
}

/**
 * Detects a JDK via `javac`, then `JAVA_HOME/bin/javac` when PATH is stale,
 * then `java -version` on PATH when there is a JRE but no `javac`.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function detectJavaCompiler(env = process.env) {
  const pathProbe = spawnSync('javac', ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const fromPath = parseJavacProbeOutput(pathProbe);
  if (fromPath) return javacPresentResult(fromPath);

  const javaHome = String(env.JAVA_HOME || '').trim();
  if (javaHome) {
    const binDir = path.join(javaHome, 'bin');
    const javacCandidates =
      process.platform === 'win32'
        ? [path.join(binDir, 'javac.exe'), path.join(binDir, 'javac')]
        : [path.join(binDir, 'javac')];
    for (const javacPath of javacCandidates) {
      if (!existsSync(javacPath)) continue;
      const r = spawnSync(javacPath, ['-version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const parsed = parseJavacProbeOutput(r);
      if (parsed) return javacPresentResult(parsed);
    }

    const javaNames = process.platform === 'win32' ? ['java.exe', 'java'] : ['java'];
    for (const name of javaNames) {
      const javaPath = path.join(binDir, name);
      if (!existsSync(javaPath)) continue;
      const jre = jreOnlyFromJavaProbe(javaPath);
      if (jre) return jre;
    }
  }

  const pathJre = jreOnlyFromJavaProbe('java');
  if (pathJre) return pathJre;

  return { present: false, rawVersion: null, majorRelease: null, display: null, jreOnly: false };
}

export function evaluateJavaCompatibility(majorRelease, min = 11) {
  if (!Number.isInteger(majorRelease) || majorRelease <= 0) {
    return { status: 'unusable', min, reason: 'Unable to parse Java version.' };
  }
  if (majorRelease < min) {
    return { status: 'unusable', min, reason: `Java version is too old for this project. Minimum required: ${min}.` };
  }
  return { status: 'ok', min, reason: null };
}

export function installHint(tool) {
  const platform = os.platform();
  if (tool === 'java') {
    if (platform === 'darwin') return 'brew install --cask temurin';
    if (platform === 'win32') {
      return 'winget install --source winget --id EclipseAdoptium.Temurin.21.JDK (or same with Microsoft.OpenJDK.21)';
    }
    return 'Linux: pacman -S jdk-openjdk | apt install default-jdk | dnf install java-21-openjdk-devel';
  }
  if (tool === 'maven') {
    if (platform === 'darwin') return 'brew install maven';
    if (platform === 'win32') return 'jwebgen --install maven';
    return 'Linux: pacman -S maven | apt install maven | dnf install maven';
  }
  if (tool === 'tomcat') {
    if (platform === 'darwin') return 'brew install tomcat, or: jwebgen --install tomcat';
    if (platform === 'win32') return 'jwebgen --install tomcat';
    return 'jwebgen --install tomcat (or your distro Tomcat package)';
  }
  if (tool === 'wildfly') {
    if (platform === 'darwin') return 'brew install wildfly-as, or: jwebgen --install wildfly';
    if (platform === 'win32') return 'jwebgen --install wildfly';
    return 'apt or dnf install wildfly where packaged; otherwise install from wildfly.org and set WILDFLY_HOME — Windows: jwebgen --install wildfly';
  }
  return 'Install it from the official source.';
}

export function which(binary) {
  const result = spawnSync(binary, ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return !result.error && result.status === 0;
}

export function validateArtifactId(value) {
  if (!value) return 'artifactId is empty.';
  if (!/^[a-z][a-z0-9-]{0,127}$/.test(value)) {
    return 'Invalid artifactId. Use only lowercase letters, digits, and hyphens. Example: my-webapp';
  }
  return null;
}

export function validateQualifiedName(value, { minSegments = 2, label = 'Nom' } = {}) {
  if (!value) return `${label} is empty.`;
  const segments = value.split('.');
  if (segments.length < minSegments) {
    return `${label} is invalid. It must contain at least ${minSegments} segments. Example: com.example`;
  }
  for (const segment of segments) {
    if (!/^[a-z_][a-z0-9_]*$/.test(segment)) {
      return `${label} is invalid. Each segment must start with a lowercase letter or "_" and then contain only letters, digits, or "_".`;
    }
  }
  return null;
}

export function validateLocation(value) {
  if (!value) return 'Location is empty.';
  if (value.includes('\0')) return 'Invalid location.';
  const root = path.parse(value).root;
  if (value === root) return 'The filesystem root directory is not allowed.';
  return null;
}

export function validateNonEmpty(value, label) {
  if (!String(value).trim()) return `${label} is empty.`;
  return null;
}

