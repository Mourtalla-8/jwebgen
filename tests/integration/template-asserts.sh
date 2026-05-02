#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

node --input-type=module <<'EOF'
import { makeWatchScript } from './src/generate/watchTemplate.js';
import { makeDeployServerScript } from './src/generate/deployTemplates.js';
import { makeLiveReloadSnippet } from './src/generate/devAssets.js';
import { makeNodeBuildScript, makeNodeDeployScript, makeNodeDevScript, makeNodeWatchScript } from './src/generate/scriptTemplates.js';
import { helloServlet, indexJsp } from './src/templates.js';

function assertContains(haystack, needle, label) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`missing [${needle}] in ${label}`);
  }
}

const watch = makeWatchScript();
assertContains(watch, 'DEV_PID_FILE=', 'watch.sh');
assertContains(watch, 'cleanup_orphan_dev_session', 'watch.sh');
assertContains(watch, '.jwebgen/scripts/deploy.sh" --cleanup-dev', 'watch.sh');
assertContains(watch, '"$UI_PAUSE_FILE" "$$"', 'watch worker/dashboard parent pid');
assertContains(watch, '[i]nspect / [x]kill port / [f]refresh / [a]help / [q]uit', 'watch staged kill options');
assertContains(watch, '[r]edeploy+restart / [i]nspect / [f]refresh / [a]help / [q]uit', 'watch wildfly http000 restart-first options');
assertContains(watch, 'Deployment failed. [f]refresh / [a]help / [q]uit', 'watch deploy remediation options');
assertContains(watch, "Option is not available in this menu.", 'watch strict key parser');
if (String(watch).includes('[r]etester')) {
  throw new Error('unexpected retester option in watch.sh');
}
if (String(watch).includes('[c]hange port')) {
  throw new Error('unexpected change port option in watch.sh');
}
if (String(watch).includes('[s]udo')) {
  throw new Error('unexpected sudo menu option in watch.sh');
}

const deployTomcat = makeDeployServerScript({ appName: 'appx', serverTarget: 'tomcat' });
assertContains(deployTomcat, '--cleanup-dev', 'deploy tomcat');
assertContains(deployTomcat, 'Tomcat dev cleanup', 'deploy tomcat cleanup');

const deployWildfly = makeDeployServerScript({ appName: 'appx', serverTarget: 'wildfly' });
assertContains(deployWildfly, '--cleanup-dev', 'deploy wildfly');
assertContains(deployWildfly, 'WildFly dev cleanup', 'deploy wildfly cleanup');

const nodeBuild = makeNodeBuildScript();
assertContains(nodeBuild, '#!/usr/bin/env node', 'build.mjs shebang');
assertContains(nodeBuild, "run('mvn'", 'build.mjs invokes mvn via spawn helper');
assertContains(nodeBuild, "from 'node:child_process'", 'build.mjs uses child_process spawn');
assertContains(nodeBuild, 'cmd.exe', 'build.mjs run helper supports Windows wrappers');
const nodeDeploy = makeNodeDeployScript();
assertContains(nodeDeploy, 'deployTomcat', 'deploy.mjs contains tomcat deploy adapter');
assertContains(nodeDeploy, 'deployWildfly', 'deploy.mjs contains wildfly deploy adapter');
assertContains(nodeDeploy, 'readMavenAppName', 'deploy.mjs resolves deploy name from pom.xml');
assertContains(nodeDeploy, 'selectWarFile', 'deploy.mjs selects preferred WAR by app name');
const nodeDev = makeNodeDevScript();
assertContains(nodeDev, 'dev.sh', 'dev.mjs delegates to dev.sh');
const nodeWatch = makeNodeWatchScript();
assertContains(nodeWatch, 'watch.sh', 'watch.mjs delegates to watch.sh');

const snippet = makeLiveReloadSnippet();
assertContains(snippet, "_lr=' + Date.now()", 'devAssets snippet cache buster');
assertContains(snippet, 'livePorts', 'devAssets snippet fallback ports');

const servlet = helloServlet({ basePackage: 'com.ex' });
assertContains(servlet, "_lr=' + Date.now()", 'helloServlet snippet cache buster');

const jsp = indexJsp({ projectName: 'x', artifactId: 'x', hasServlet: true });
assertContains(jsp, "_lr=' + Date.now()", 'indexJsp snippet cache buster');
EOF

echo "Template asserts: OK"
