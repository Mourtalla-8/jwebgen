import pc from 'picocolors';
import { runInstallTool } from './preflight.js';

const ALLOWED = new Set(['java', 'maven', 'tomcat', 'wildfly']);

/**
 * CLI entry for `jwebgen --install <tool>`.
 * @param {string} tool
 * @returns {Promise<number>} exit code
 */
export async function runInstallCli(tool) {
  const key = String(tool || '')
    .trim()
    .toLowerCase();
  if (!ALLOWED.has(key)) {
    console.error(pc.red(`Unknown tool "${tool}". Use: java, maven, tomcat, or wildfly.`));
    return 1;
  }
  return runInstallTool(key);
}
