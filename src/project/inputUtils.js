import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { windowsMavenPortableInstallShellCommand } from './windowsSetupInstall.js';

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

export function detectJavaCompiler() {
  const result = spawnSync('javac', ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (!output) return { present: false, rawVersion: null, majorRelease: null, display: null };
  const versionMatch = output.match(/\bjavac\s+([^\s"]+)/i) || output.match(/version "([^"]+)"/i);
  const rawVersion = versionMatch ? versionMatch[1] : output;
  const majorRelease = parseJavaMajorRelease(rawVersion);
  return { present: true, rawVersion, majorRelease, display: majorRelease ? `JDK ${majorRelease} (${rawVersion})` : rawVersion };
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
      return 'winget install EclipseAdoptium.Temurin.21.JDK (or winget install Microsoft.OpenJDK.21)';
    }
    return 'Linux: pacman -S jdk-openjdk | apt install default-jdk | dnf install java-21-openjdk-devel';
  }
  if (tool === 'maven') {
    if (platform === 'darwin') return 'brew install maven';
    if (platform === 'win32') return windowsMavenPortableInstallShellCommand();
    return 'Linux: pacman -S maven | apt install maven | dnf install maven';
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

