#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

node --input-type=module <<'EOF'
import { makeWatchScript } from './src/generate/watchTemplate.js';
import { makeDeployServerScript } from './src/generate/deployTemplates.js';
import { makeAddServletScript, makeLiveReloadClientScript } from './src/generate/devAssets.js';
import { helloServlet, indexJsp } from './src/templates.js';
import { DEV_WORKER_SCRIPT_TEMPLATE } from './src/generate/watchEmbeddedTemplates.js';

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

assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'createProxyServer', 'worker contains dev proxy server');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, '/.jwebgen/live-reload.js', 'worker serves live-reload asset');

const client = makeLiveReloadClientScript();
assertContains(client, 'window.location.reload()', 'devAssets live reload uses clean URL refresh');
assertContains(client, 'livePorts', 'devAssets live reload client fallback ports');

const addServlet = makeAddServletScript({ basePackage: 'com.ex', appName: 'jwebgen' });
assertContains(addServlet, 'jwebgen --build', 'add-servlet next steps build command');
assertContains(addServlet, 'jwebgen --dev', 'add-servlet next steps dev command');
if (String(addServlet).includes('out.println("<script>")')) {
  throw new Error('unexpected inline script in add-servlet output');
}

const servlet = helloServlet({ basePackage: 'com.ex' });
if (String(servlet).includes('<script>')) {
  throw new Error('unexpected inline script in helloServlet template');
}

const jsp = indexJsp({ projectName: 'x', artifactId: 'x', hasServlet: true });
if (String(jsp).includes('<script>')) {
  throw new Error('unexpected inline script in indexJsp template');
}
EOF

echo "Template asserts: OK"
