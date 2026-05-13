import { existsSync, readFileSync } from 'node:fs';

/**
 * Parse /etc/os-release when present (Linux only).
 * @returns {{ ID: string, ID_LIKE: string } | null}
 */
export function readLinuxOsRelease() {
  if (process.platform !== 'linux') return null;
  const p = '/etc/os-release';
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    /** @type {Record<string, string>} */
    const map = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      map[m[1]] = v;
    }
    return { ID: map.ID || '', ID_LIKE: map.ID_LIKE || '' };
  } catch {
    return null;
  }
}

/**
 * Preferred package-manager identifiers for ordering install hints (first = best guess for this distro).
 * @returns {string[]}
 */
export function linuxPreferredPmOrder() {
  const rel = readLinuxOsRelease();
  const blob = `${rel?.ID || ''} ${rel?.ID_LIKE || ''}`.toLowerCase();
  /** @type {string[]} */
  const tier1 = [];
  if (/\b(debian|ubuntu|raspbian|linuxmint|pop|kali|neon)\b/.test(blob)) tier1.push('apt');
  if (/\b(fedora|rhel|centos|rocky|almalinux|mageia|ol|oracle)\b/.test(blob)) tier1.push('dnf');
  if (/\b(arch|manjaro|artix|cachyos|endeavouros)\b/.test(blob)) tier1.push('pacman');
  if (/\b(suse|opensuse|sle)\b/.test(blob)) tier1.push('zypper');
  if (/\balpine\b/.test(blob)) tier1.push('apk');
  const rest = ['apt', 'dnf', 'pacman', 'zypper', 'apk'];
  return [...new Set([...tier1, ...rest])];
}

/**
 * @param {string | null | undefined} shellCommand
 * @param {string[]} pmOrder from linuxPreferredPmOrder()
 */
export function linuxPmSortIndex(shellCommand, pmOrder) {
  const c = String(shellCommand || '').toLowerCase();
  for (let i = 0; i < pmOrder.length; i++) {
    const pm = pmOrder[i];
    if (pm === 'apt' && (/\bapt-get\b/.test(c) || /\bapt install\b/.test(c) || /\bapt\s+install\b/.test(c))) return i;
    if (pm === 'dnf' && c.includes('dnf')) return i;
    if (pm === 'pacman' && /\bpacman\b/.test(c)) return i;
    if (pm === 'zypper' && /\bzypper\b/.test(c)) return i;
    if (pm === 'apk' && /\bapk\b/.test(c)) return i;
  }
  if (/\bcurl\b/.test(c)) return pmOrder.length + 1;
  return pmOrder.length;
}

/**
 * @template {{ shellCommand?: string | null }} T
 * @param {T[]} methods
 * @returns {T[]}
 */
export function sortLinuxInstallMethods(methods) {
  const order = linuxPreferredPmOrder();
  return [...methods].sort(
    (a, b) => linuxPmSortIndex(a.shellCommand, order) - linuxPmSortIndex(b.shellCommand, order)
  );
}
