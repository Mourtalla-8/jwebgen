/**
 * Declarative install methods for setup / dry-run / `jwebgen --install`.
 * Preview lines are short and user-facing; shell commands may be longer and are never logged in setup UX.
 */

export const PREVIEW_MAX_LEN = 120;

export function installCliLine(tool) {
  return `jwebgen --install ${tool}`;
}

function shellInstallAllowed(shellCommand, platform, hasCommandImpl) {
  const c = String(shellCommand || '');
  const lower = c.toLowerCase();
  const pm = {
    winget: hasCommandImpl('winget'),
    brew: hasCommandImpl('brew'),
    apt: hasCommandImpl('apt-get') || hasCommandImpl('apt'),
    dnf: hasCommandImpl('dnf'),
    pacman: hasCommandImpl('pacman')
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
  if (lower.includes('|') && lower.includes('bash')) {
    if (!bashOk) return false;
  }
  if (/\bpacman\b/i.test(c)) return Boolean(pm.pacman);
  if (/\bdnf\b/i.test(c)) return Boolean(pm.dnf);
  if (/\bapt-get\b/i.test(c) || /\bapt\b/i.test(c)) return Boolean(pm.apt);
  return true;
}

function previewForShell(cmd) {
  const s = String(cmd || '');
  if (!s) return null;
  if (s.length <= PREVIEW_MAX_LEN) return s;
  return null;
}

/**
 * @returns {Array<{ id: string, label: string, previewLine: string | null, shellCommand: string | null, internalId: string | null }>}
 */
export function getInstallMethodsForKey(key, platform) {
  /** @type {Array<{ id: string, label: string, previewLine: string | null, shellCommand: string | null, internalId: string | null }>} */
  const out = [];

  if (key === 'java') {
    if (platform === 'win32') {
      const t1 = 'winget install EclipseAdoptium.Temurin.21.JDK';
      const t2 = 'winget install Microsoft.OpenJDK.21';
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
      const rows = [
        { id: 'java-linux-apt', label: 'apt (default-jdk)', shellCommand: 'sudo apt install -y default-jdk' },
        { id: 'java-linux-dnf', label: 'dnf (java-21-openjdk-devel)', shellCommand: 'sudo dnf install -y java-21-openjdk-devel' },
        { id: 'java-linux-pacman', label: 'pacman (jdk-openjdk)', shellCommand: 'sudo pacman -S --noconfirm jdk-openjdk' }
      ];
      for (const r of rows) {
        out.push({ ...r, previewLine: previewForShell(r.shellCommand), internalId: null });
      }
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
      const rows = [
        { id: 'maven-linux-apt', label: 'apt (maven)', shellCommand: 'sudo apt install -y maven' },
        { id: 'maven-linux-dnf', label: 'dnf (maven)', shellCommand: 'sudo dnf install -y maven' },
        { id: 'maven-linux-pacman', label: 'pacman (maven)', shellCommand: 'sudo pacman -S --noconfirm maven' }
      ];
      for (const r of rows) {
        out.push({ ...r, previewLine: previewForShell(r.shellCommand), internalId: null });
      }
    }
    return out;
  }

  if (key === 'tomcat') {
    if (platform === 'win32') {
      const shellCommand = 'winget install Apache.Tomcat9';
      out.push({
        id: 'tomcat-win-winget',
        label: 'winget (Apache Tomcat)',
        shellCommand,
        previewLine: previewForShell(shellCommand),
        internalId: null
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
      const rows = [
        { id: 'tomcat-linux-apt', label: 'apt (tomcat10)', shellCommand: 'sudo apt install -y tomcat10' },
        { id: 'tomcat-linux-dnf', label: 'dnf (tomcat)', shellCommand: 'sudo dnf install -y tomcat' },
        { id: 'tomcat-linux-pacman', label: 'pacman (tomcat10)', shellCommand: 'sudo pacman -S --noconfirm tomcat10' }
      ];
      for (const r of rows) {
        out.push({ ...r, previewLine: previewForShell(r.shellCommand), internalId: null });
      }
    }
    return out;
  }

  if (key === 'wildfly') {
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
      const rows = [
        { id: 'wildfly-linux-apt', label: 'apt (wildfly)', shellCommand: 'sudo apt install -y wildfly' },
        { id: 'wildfly-linux-dnf', label: 'dnf (wildfly)', shellCommand: 'sudo dnf install -y wildfly' },
        { id: 'wildfly-linux-pacman', label: 'pacman (wildfly)', shellCommand: 'sudo pacman -S --noconfirm wildfly' }
      ];
      for (const r of rows) {
        out.push({ ...r, previewLine: previewForShell(r.shellCommand), internalId: null });
      }
    }
    return out;
  }

  return out;
}

export function filterInstallMethods(methods, platform, hasCommandImpl) {
  return methods.filter((m) => {
    if (m.internalId === 'maven-windows-portable') {
      return platform === 'win32' && (hasCommandImpl('powershell') || hasCommandImpl('powershell.exe'));
    }
    if (m.shellCommand) return shellInstallAllowed(m.shellCommand, platform, hasCommandImpl);
    return false;
  });
}
