import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { runCreateCommand } from '../../src/cli/createCommand.js';

test('runCreateCommand keeps typed project name casing for default directory', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jwebgen-create-casing-'));
  const startCwd = process.cwd();
  process.chdir(tempRoot);

  const writes = [];
  const deps = {
    intro: () => {},
    outro: () => {},
    text: async () => '',
    select: async () => 'tomcat',
    confirm: async () => true,
    spinner: () => ({ start() {}, stop() {} }),
    isCancel: () => false,
    note: () => {},
    appName: 'jwebgen',
    serverOptions: [{ value: 'tomcat', label: 'Tomcat' }],
    validateNonEmpty: () => null,
    validateLocation: () => null,
    slugifyArtifactId: (v) => String(v).trim().toLowerCase(),
    validateArtifactId: () => null,
    normalizePackageCandidate: (v) => String(v).trim(),
    validateQualifiedName: () => null,
    sanitizePackage: (v) => String(v).trim().toLowerCase(),
    artifactPackagePart: () => 'exo1',
    expandHome: (v) => v,
    detectJavaCompiler: () => ({ present: true, majorRelease: 21, display: 'javac 21' }),
    installHint: () => 'n/a',
    evaluateJavaCompatibility: () => ({ status: 'ok' }),
    packageToPath: (pkg) => pkg.replaceAll('.', '/'),
    writeFileSafe: async (filePath, content) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, String(content), 'utf8');
      writes.push(filePath);
    },
    makeDevMd: () => '# dev',
    makeBuildScript: () => '#!/usr/bin/env bash\necho build\n',
    makeDeployServerScript: () => '#!/usr/bin/env bash\necho deploy\n',
    makeDeploySelectorScript: () => '#!/usr/bin/env bash\necho deploy\n',
    makeDevScript: () => '#!/usr/bin/env bash\necho dev\n',
    makeWatchScript: () => '#!/usr/bin/env bash\necho watch\n',
    makeAddServletScript: () => '#!/usr/bin/env bash\necho add\n',
    makeLiveReloadClientScript: () => 'console.log("lr")',
    makeExecutable: async () => {},
    ensureBuildTools: async () => ({ javaOk: true, mavenOk: true }),
    gitignore: () => '',
    helloServlet: () => 'class Hello {}',
    indexJsp: () => '<html></html>',
    pomXml: ({ artifactId }) => `<project><artifactId>${artifactId}</artifactId></project>`,
    readmeMd: () => '# readme',
    tomcatContextXmlDev: () => '<Context/>',
    webXml: () => '<web-app/>',
    cli: { yes: true, projectName: 'Exo1', serverTarget: 'tomcat' }
  };

  try {
    await runCreateCommand(deps);
    const targetDir = path.join(tempRoot, 'Exo1');
    assert.equal(existsSync(targetDir), true);
    const pom = await readFile(path.join(targetDir, 'pom.xml'), 'utf8');
    assert.match(pom, /<artifactId>exo1<\/artifactId>/);
    assert.ok(!writes.some((f) => f.includes('/src/main/webapp/.jwebgen/')));
  } finally {
    process.chdir(startCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
