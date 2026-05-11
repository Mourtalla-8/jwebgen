import path from 'node:path';
import { existsSync } from 'node:fs';

export const LINUX_DEFAULT_TOMCAT_HOME = '/var/lib/tomcat10';
export const LINUX_DEFAULT_WILDFLY_HOME = '/opt/wildfly';

/** True when `homeDir` looks like an Apache Tomcat distribution or package CATALINA_HOME (not merely an empty webapps tree). */
export function looksLikeApacheTomcatHome(homeDir, platform = process.platform) {
  const root = String(homeDir || '').trim();
  if (!root || !existsSync(root)) return false;
  const catalinaJar = path.join(root, 'lib', 'catalina.jar');
  const bootstrapJar = path.join(root, 'bin', 'bootstrap.jar');
  if (!existsSync(catalinaJar) || !existsSync(bootstrapJar)) return false;
  const sh = path.join(root, 'bin', 'catalina.sh');
  const bat = path.join(root, 'bin', 'catalina.bat');
  if (platform === 'win32') return existsSync(bat) || existsSync(sh);
  return existsSync(sh) || existsSync(bat);
}

/** WildFly unzip layout always includes jboss-modules.jar at product root (not deployments-only scaffolding). */
export function looksLikeWildflyHome(homeDir) {
  const root = String(homeDir || '').trim();
  if (!root || !existsSync(root)) return false;
  return existsSync(path.join(root, 'jboss-modules.jar'));
}

/** Used by setup/deploy checks: validates explicit env path, or probes common Linux package locations before the webapps stub path. */
/** When only standalone/deployments is configured, derive WILDFLY_HOME as its grandparent directory. */
export function inferWildflyHomeFromDeployments(deploymentsDir = '') {
  const dep = path.resolve(String(deploymentsDir || '').trim());
  if (!dep || path.basename(dep) !== 'deployments') return '';
  const standalone = path.dirname(dep);
  if (path.basename(standalone) !== 'standalone') return '';
  return path.dirname(standalone);
}

export function probeApacheTomcatHome({ env = process.env, cfg = {}, platform = process.platform } = {}) {
  const configured = String(
    env.TOMCAT_HOME || env.TOMCAT10 || env.CATALINA_HOME || cfg.TOMCAT_HOME || cfg.TOMCAT10 || cfg.CATALINA_HOME || ''
  ).trim();
  if (configured) {
    return looksLikeApacheTomcatHome(configured, platform)
      ? { ok: true, home: configured, probe: 'env' }
      : { ok: false, home: configured, probe: 'env' };
  }
  if (platform === 'darwin') {
    const brewCandidates = [
      '/opt/homebrew/opt/tomcat@10/libexec',
      '/opt/homebrew/opt/tomcat/libexec',
      '/usr/local/opt/tomcat@10/libexec',
      '/usr/local/opt/tomcat/libexec'
    ];
    for (const c of brewCandidates) {
      if (looksLikeApacheTomcatHome(c, platform)) return { ok: true, home: c, probe: 'detected' };
    }
    const home = resolveTomcatHome({ env, cfg, platform });
    return looksLikeApacheTomcatHome(home, platform)
      ? { ok: true, home, probe: 'resolved' }
      : { ok: false, home, probe: 'resolved' };
  }
  if (platform !== 'linux') {
    const home = resolveTomcatHome({ env, cfg, platform });
    return looksLikeApacheTomcatHome(home, platform)
      ? { ok: true, home, probe: 'resolved' }
      : { ok: false, home, probe: 'resolved' };
  }
  const candidates = ['/usr/share/tomcat10', '/usr/share/tomcat', '/usr/local/tomcat', LINUX_DEFAULT_TOMCAT_HOME];
  for (const c of candidates) {
    if (looksLikeApacheTomcatHome(c, platform)) return { ok: true, home: c, probe: 'detected' };
  }
  return { ok: false, home: '', probe: '' };
}

export function resolveTomcatHome({ env = process.env, cfg = {}, platform = process.platform } = {}) {
  const configured = String(
    env.TOMCAT_HOME || env.TOMCAT10 || env.CATALINA_HOME || cfg.TOMCAT_HOME || cfg.TOMCAT10 || cfg.CATALINA_HOME || ''
  ).trim();
  if (configured) return configured;
  return platform === 'linux' ? LINUX_DEFAULT_TOMCAT_HOME : '';
}

export function resolveWildflyPaths({ env = process.env, cfg = {}, platform = process.platform } = {}) {
  const explicitDeployments = String(env.WILDFLY_DEPLOYMENTS || cfg.WILDFLY_DEPLOYMENTS || '').trim();
  let wildflyHome = String(env.WILDFLY_HOME || cfg.WILDFLY_HOME || '').trim();
  if (!wildflyHome && explicitDeployments) {
    wildflyHome = inferWildflyHomeFromDeployments(explicitDeployments);
  }
  const defaultWildflyHome = platform === 'linux' ? LINUX_DEFAULT_WILDFLY_HOME : '';
  let deployments = explicitDeployments;
  if (!deployments && wildflyHome) {
    deployments = path.join(wildflyHome, 'standalone', 'deployments');
  }
  if (!wildflyHome && platform === 'darwin' && !explicitDeployments) {
    const brewWildfly = [
      '/opt/homebrew/opt/wildfly-as/libexec',
      '/usr/local/opt/wildfly-as/libexec'
    ];
    for (const c of brewWildfly) {
      if (looksLikeWildflyHome(c)) {
        wildflyHome = c;
        deployments = path.join(c, 'standalone', 'deployments');
        break;
      }
    }
  }
  if (!wildflyHome && platform === 'linux' && !explicitDeployments) {
    wildflyHome = defaultWildflyHome;
    deployments = path.join(wildflyHome, 'standalone', 'deployments');
  }
  return {
    wildflyHome,
    deployments: String(deployments || '').trim()
  };
}

export function validateWildflyDeploymentsPath(deploymentsPath = '') {
  const resolved = deploymentsPath ? path.resolve(deploymentsPath) : '';
  const rootPath = resolved ? path.parse(resolved).root : '';
  if (!resolved || resolved === rootPath) {
    return { ok: false, resolved, rootPath };
  }
  return { ok: true, resolved, rootPath };
}
