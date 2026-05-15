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
  const finalName = finalMatch?.[1]?.trim();
  if (finalName) return finalName;

  const withoutParent = xml.replace(/<parent>[\s\S]*?<\/parent>/gi, '');
  const artifactMatch = withoutParent.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/);
  const artifactId = artifactMatch?.[1]?.trim();
  if (artifactId) return artifactId;

  return path.basename(projectRoot);
}
