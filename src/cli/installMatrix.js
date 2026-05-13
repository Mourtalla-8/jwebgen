/**
 * Declarative install methods for setup / dry-run / `jwebgen --install`.
 * Preview lines are short and user-facing; shell commands may be longer and are never logged in setup UX.
 */

import {
  WINDOWS_WILDFLY_PORTABLE_VERSION,
  WINDOWS_WILDFLY_PORTABLE_ZIP_SHA256
} from '../project/windowsSetupInstall.js';
import { sortLinuxInstallMethods } from './linuxOs.js';

export const PREVIEW_MAX_LEN = 120;

export function installCliLine(tool) {
  return `jwebgen --install ${tool}`;
}

export function commandPreviewForInstallMethod(method, tool) {
  if (method?.previewLine) return method.previewLine;
  if (method?.shellCommand) return method.shellCommand;
  if (method?.internalId) return installCliLine(tool);
  return null;
}

function shellInstallAllowed(shellCommand, platform, hasCommandImpl) {
  const c = String(shellCommand || '');
  const lower = c.toLowerCase();
  const pm = {
    winget: hasCommandImpl('winget'),
    brew: hasCommandImpl('brew'),
    apt: hasCommandImpl('apt-get') || hasCommandImpl('apt'),
    dnf: hasCommandImpl('dnf'),
    pacman: hasCommandImpl('pacman'),
    zypper: hasCommandImpl('zypper'),
    apk: hasCommandImpl('apk')
  };
  const bashOk = platform === 'win32' ? hasCommandImpl('bash.exe') : hasCommandImpl('bash');
  const curlOk = platform === 'win32' ? hasCommandImpl('curl.exe') : hasCommandImpl('curl');

  if (platform === 'win32') {
    const trimmed = c.trimStart();
    if (/^powershell(\.exe)?\b/i.test(trimmed)) {
      return hasCommandImpl('powershell') || hasCommandImpl('powershell.exe');
    }
    return Boolean(pm.winget) && /\bwinget\b/i.test(c);
  }
  if (platform === 'darwin') return Boolean(pm.brew) && /\bbrew\b/i.test(c);
  if (lower.includes('curl ') || lower.includes('curl\t') || lower.includes('curl -')) {
    if (!curlOk) return false;
  }
  if (/\bunzip\b/.test(lower) && !hasCommandImpl('unzip')) return false;
  if (/\bsha256sum\b/.test(lower) && !hasCommandImpl('sha256sum')) return false;
  if (lower.includes('|') && lower.includes('bash')) {
    if (!bashOk) return false;
  }
  if (/\bpacman\b/i.test(c)) return Boolean(pm.pacman);
  if (c.includes('dnf')) return Boolean(pm.dnf);
  if (/\bapt-get\b/i.test(c) || /\bapt\b/i.test(c)) return Boolean(pm.apt);
  if (/\bzypper\b/i.test(c)) return Boolean(pm.zypper);
  if (/\bapk\b/i.test(c)) return Boolean(pm.apk);
  if (platform === 'linux' && curlOk && /\bcurl\b/i.test(c)) return true;
  if (platform === 'linux') return false;
  return true;
}

function previewForShell(cmd) {
  const s = String(cmd || '');
  if (!s) return null;
  if (s.length <= PREVIEW_MAX_LEN) return s;
  return null;
}

/**
 * One-line-friendly shell: download WildFly zip, verify SHA-256 (mirror .sha256 or embedded), unzip, print WILDFLY_HOME hint.
 * @param {string} version
 * @param {string} zipName
 * @param {string} embeddedSha256
 */
function wildflyLinuxOfficialZipCommand(version, zipName, embeddedSha256) {
  return [
    'set -euo pipefail',
    'mkdir -p "$HOME/opt"',
    `ZIP="$HOME/opt/${zipName}"`,
    `URL="https://download.jboss.org/wildfly/${version}/${zipName}"`,
    'curl -fSL -o "$ZIP" "$URL"',
    'SUM="$ZIP.sha256"',
    'if curl -fSL -o "$SUM" "$URL.sha256" 2>/dev/null; then',
    'EXP=$(grep -oE \'[0-9a-fA-F]{64}\' "$SUM" | head -n1 | tr \'[:upper:]\' \'[:lower:]\')',
    'ACT=$(sha256sum "$ZIP" | awk \'{print tolower($1)}\')',
    'test -n "$EXP" && test "$EXP" = "$ACT" || { echo "jwebgen: WildFly SHA256 mismatch (.sha256 from mirror)" >&2; rm -f "$ZIP"; exit 1; }',
    'else',
    `EXP='${embeddedSha256}'`,
    'ACT=$(sha256sum "$ZIP" | awk \'{print tolower($1)}\')',
    'test "$EXP" = "$ACT" || { echo "jwebgen: WildFly SHA256 mismatch (embedded checksum)" >&2; rm -f "$ZIP"; exit 1; }',
    'fi',
    'unzip -oq "$ZIP" -d "$HOME/opt"',
    `echo "export WILDFLY_HOME=\\$HOME/opt/wildfly-${version}"`
  ].join('; ');
}

function finalizeLinuxRows(rows) {
  return sortLinuxInstallMethods(rows).map((r) => ({
    ...r,
    previewLine: previewForShell(r.shellCommand),
    internalId: null
  }));
}

/**
 * @returns {Array<{ id: string, label: string, previewLine: string | null, shellCommand: string | null, internalId: string | null }>}
 */
export function getInstallMethodsForKey(key, platform) {
  /** @type {Array<{ id: string, label: string, previewLine: string | null, shellCommand: string | null, internalId: string | null }>} */
  const out = [];

  if (key === 'java') {
    if (platform === 'win32') {
      const t1 = 'winget install --source winget --id EclipseAdoptium.Temurin.21.JDK';
      const t2 = 'winget install --source winget --id Microsoft.OpenJDK.21';
      out.push({
        id: 'java-win-temurin',
        label: 'winget (Eclipse Temurin 21 JDK)',
        shellCommand: t1,
        previewLine: previewForShell(t1),
        internalId: null
      });
      out.push({
        id: 'java-win-msopenjdk',
        label: 'winget (Microsoft OpenJDK 21)',
        shellCommand: t2,
        previewLine: previewForShell(t2),
        internalId: null
      });
    } else if (platform === 'darwin') {
      const shellCommand = 'brew install --cask temurin';
      out.push({
        id: 'java-darwin-brew',
        label: 'Homebrew (Temurin)',
        shellCommand,
        previewLine: previewForShell(shellCommand),
        internalId: null
      });
    } else {
      return finalizeLinuxRows([
        { id: 'java-linux-apt', label: 'apt (default-jdk)', shellCommand: 'sudo apt install -y default-jdk' },
        { id: 'java-linux-dnf', label: 'dnf (java-21-openjdk-devel)', shellCommand: 'sudo dnf install -y java-21-openjdk-devel' },
        { id: 'java-linux-pacman', label: 'pacman (jdk-openjdk)', shellCommand: 'sudo pacman -S --noconfirm jdk-openjdk' },
        {
          id: 'java-linux-zypper',
          label: 'zypper (java-21-openjdk-devel)',
          shellCommand: 'sudo zypper install -y java-21-openjdk-devel'
        },
        { id: 'java-linux-apk', label: 'apk (openjdk21)', shellCommand: 'sudo apk add openjdk21' }
      ]);
    }
    return out;
  }

  if (key === 'maven') {
    if (platform === 'win32') {
      out.push({
        id: 'maven-win-embedded',
        label: 'Maven from apache.org',
        shellCommand: null,
        previewLine: null,
        internalId: 'maven-windows-portable'
      });
    } else if (platform === 'darwin') {
      const shellCommand = 'brew install maven';
      out.push({
        id: 'maven-darwin-brew',
        label: 'Homebrew (Maven)',
        shellCommand,
        previewLine: previewForShell(shellCommand),
        internalId: null
      });
    } else {
      return finalizeLinuxRows([
        { id: 'maven-linux-apt', label: 'apt (maven)', shellCommand: 'sudo apt install -y maven' },
        { id: 'maven-linux-dnf', label: 'dnf (maven)', shellCommand: 'sudo dnf install -y maven' },
        { id: 'maven-linux-pacman', label: 'pacman (maven)', shellCommand: 'sudo pacman -S --noconfirm maven' },
        { id: 'maven-linux-zypper', label: 'zypper (maven)', shellCommand: 'sudo zypper install -y maven' },
        { id: 'maven-linux-apk', label: 'apk (maven)', shellCommand: 'sudo apk add maven' }
      ]);
    }
    return out;
  }

  if (key === 'tomcat') {
    if (platform === 'win32') {
      out.push({
        id: 'tomcat-win-embedded',
        label: 'Tomcat from apache.org',
        shellCommand: null,
        previewLine: null,
        internalId: 'tomcat-windows-portable'
      });
    } else if (platform === 'darwin') {
      const shellCommand = 'brew install tomcat';
      out.push({
        id: 'tomcat-darwin-brew',
        label: 'Homebrew (Tomcat)',
        shellCommand,
        previewLine: previewForShell(shellCommand),
        internalId: null
      });
    } else {
      return finalizeLinuxRows([
        { id: 'tomcat-linux-apt', label: 'apt (tomcat10)', shellCommand: 'sudo apt install -y tomcat10' },
        { id: 'tomcat-linux-dnf', label: 'dnf (tomcat)', shellCommand: 'sudo dnf install -y tomcat' },
        { id: 'tomcat-linux-pacman', label: 'pacman (tomcat10)', shellCommand: 'sudo pacman -S --noconfirm tomcat10' },
        { id: 'tomcat-linux-zypper', label: 'zypper (tomcat)', shellCommand: 'sudo zypper install -y tomcat' },
        { id: 'tomcat-linux-apk', label: 'apk (tomcat10)', shellCommand: 'sudo apk add tomcat10' }
      ]);
    }
    return out;
  }

  if (key === 'wildfly') {
    if (platform === 'win32') {
      out.push({
        id: 'wildfly-win-embedded',
        label: 'WildFly official release',
        shellCommand: null,
        previewLine: null,
        internalId: 'wildfly-windows-portable'
      });
      return out;
    }
    if (platform === 'darwin') {
      const shellCommand = 'brew install wildfly-as';
      out.push({
        id: 'wildfly-darwin-brew',
        label: 'Homebrew (WildFly)',
        shellCommand,
        previewLine: previewForShell(shellCommand),
        internalId: null
      });
    } else {
      const v = WINDOWS_WILDFLY_PORTABLE_VERSION;
      const zipName = `wildfly-${v}.zip`;
      const customZip = wildflyLinuxOfficialZipCommand(v, zipName, WINDOWS_WILDFLY_PORTABLE_ZIP_SHA256);
      return finalizeLinuxRows([
        { id: 'wildfly-linux-apt', label: 'apt (wildfly)', shellCommand: 'sudo apt install -y wildfly' },
        { id: 'wildfly-linux-dnf', label: 'dnf (wildfly)', shellCommand: 'sudo dnf install -y wildfly' },
        {
          id: 'wildfly-linux-official-zip',
          label: `Official zip to ~/opt (${v}, curl+unzip+SHA256)`,
          shellCommand: customZip
        }
      ]);
    }
    return out;
  }

  return out;
}

export function filterInstallMethods(methods, platform, hasCommandImpl) {
  return methods.filter((m) => {
    if (
      m.internalId === 'maven-windows-portable'
      || m.internalId === 'tomcat-windows-portable'
      || m.internalId === 'wildfly-windows-portable'
    ) {
      return platform === 'win32' && (hasCommandImpl('powershell') || hasCommandImpl('powershell.exe'));
    }
    if (m.shellCommand) return shellInstallAllowed(m.shellCommand, platform, hasCommandImpl);
    return false;
  });
}
