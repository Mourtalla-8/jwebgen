import path from 'node:path';

export const LINUX_DEFAULT_TOMCAT_HOME = '/var/lib/tomcat10';
export const LINUX_DEFAULT_WILDFLY_HOME = '/opt/wildfly';

export function resolveTomcatHome({ env = process.env, cfg = {}, platform = process.platform } = {}) {
  const configured = String(
    env.TOMCAT_HOME || env.TOMCAT10 || env.CATALINA_HOME || cfg.TOMCAT_HOME || cfg.TOMCAT10 || cfg.CATALINA_HOME || ''
  ).trim();
  if (configured) return configured;
  return platform === 'linux' ? LINUX_DEFAULT_TOMCAT_HOME : '';
}

export function resolveWildflyPaths({ env = process.env, cfg = {}, platform = process.platform } = {}) {
  const defaultWildflyHome = platform === 'linux' ? LINUX_DEFAULT_WILDFLY_HOME : '';
  const wildflyHome = String(env.WILDFLY_HOME || cfg.WILDFLY_HOME || defaultWildflyHome).trim();
  const deployments = String(
    env.WILDFLY_DEPLOYMENTS || cfg.WILDFLY_DEPLOYMENTS || (wildflyHome ? path.join(wildflyHome, 'standalone', 'deployments') : '')
  ).trim();
  return { wildflyHome, deployments };
}

export function validateWildflyDeploymentsPath(deploymentsPath = '') {
  const resolved = deploymentsPath ? path.resolve(deploymentsPath) : '';
  const rootPath = resolved ? path.parse(resolved).root : '';
  if (!resolved || resolved === rootPath) {
    return { ok: false, resolved, rootPath };
  }
  return { ok: true, resolved, rootPath };
}
