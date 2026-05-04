import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function readMavenWarBaseName(projectRoot) {
  const pomPath = path.join(projectRoot, 'pom.xml');
  if (!existsSync(pomPath)) return path.basename(projectRoot);
  let xml;
  try {
    xml = readFileSync(pomPath, 'utf8');
  } catch {
    return path.basename(projectRoot);
  }
  const finalMatch = xml.match(/<finalName>\s*([^<]+?)\s*<\/finalName>/);
  if (finalMatch?.[1]) return finalMatch[1].trim();

  const withoutParent = xml.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
  const artifactMatch = withoutParent.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/);
  if (artifactMatch?.[1]) return artifactMatch[1].trim();

  return path.basename(projectRoot);
}
