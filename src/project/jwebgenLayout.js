import path from 'node:path';

export const JWEBGEN_DIR_NAME = '.jwebgen';
export const JWEBGEN_CONFIG_BASENAME = '.jwebgenrc';

/** Directory for jwebgen tooling inside a generated project (e.g. .../my-app/.jwebgen). */
export function jwebgenMetaDir(projectRoot) {
  return path.join(projectRoot, JWEBGEN_DIR_NAME);
}

export function jwebgenScriptsDir(projectRoot) {
  return path.join(projectRoot, JWEBGEN_DIR_NAME, 'scripts');
}

export function jwebgenConfigPath(projectRoot) {
  return path.join(projectRoot, JWEBGEN_DIR_NAME, JWEBGEN_CONFIG_BASENAME);
}
