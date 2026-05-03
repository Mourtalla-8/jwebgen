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
assertContains(watch, 'wait_for_worker_cycle()', 'watch redeploy state-based wait');
assertContains(watch, 'JWEBGEN_WORKER_RESTART_GRACE_MS', 'watch worker restart grace');
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
assertContains(deployTomcat, 'ensure_tomcat_dev_reloadable_context', 'deploy tomcat reloadable context for servlets');
assertContains(deployTomcat, 'WEB-INF/web.xml', 'deploy tomcat web.xml reload hint');
assertContains(deployTomcat, 'Unable to refresh Tomcat deployment descriptor (WEB-INF/web.xml).', 'deploy tomcat strict web.xml refresh');
assertContains(deployTomcat, 'Unable to refresh Tomcat context metadata.', 'deploy tomcat strict context refresh');

const deployWildfly = makeDeployServerScript({ appName: 'appx', serverTarget: 'wildfly' });
assertContains(deployWildfly, '--cleanup-dev', 'deploy wildfly');
assertContains(deployWildfly, 'WildFly dev cleanup', 'deploy wildfly cleanup');
assertContains(deployWildfly, 'JWEBGEN_WILDFLY_DEPLOY_TIMEOUT', 'deploy wildfly timeout override');
assertContains(deployWildfly, 'JWEBGEN_FORCE_WILDFLY_REDEPLOY', 'deploy wildfly force redeploy env');
assertContains(deployWildfly, 'skipped redeploy', 'deploy wildfly skip dodeploy when unchanged');
assertContains(deployWildfly, 'cmp -s', 'deploy wildfly WAR identity via cmp not size-only');
assertContains(deployWildfly, 'DEPLOY_HTTP_OK', 'deploy wildfly HTTP probe short-circuits marker failure');

assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'createProxyServer', 'worker contains dev proxy server');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, '/.jwebgen/live-reload.js', 'worker serves live-reload asset');

const client = makeLiveReloadClientScript();
assertContains(client, "searchParams.set('_jwg'", 'devAssets live reload cache-bust refresh');
assertContains(client, 'livePorts', 'devAssets live reload client fallback ports');

const addServlet = makeAddServletScript({ basePackage: 'com.ex', appName: 'jwebgen' });
assertContains(addServlet, 'jwebgen --build', 'add-servlet next steps build command');
assertContains(addServlet, 'jwebgen --dev', 'add-servlet next steps dev command');
if (String(addServlet).includes('out.println("<script>")')) {
  throw new Error('unexpected inline script in add-servlet output');
}

const servlet = helloServlet({ basePackage: 'com.ex' });
const lrServlet = String(servlet);
if (lrServlet.includes('/.jwebgen/live-reload.js') || lrServlet.includes('__JWEBGEN_LIVE_PORT')) {
  throw new Error('unexpected LiveReload artifact in helloServlet template');
}

const jsp = indexJsp({ projectName: 'x', artifactId: 'x', hasServlet: true });
const lrJsp = String(jsp);
if (lrJsp.includes('/.jwebgen/live-reload.js') || lrJsp.includes('__JWEBGEN_LIVE_PORT')) {
  throw new Error('unexpected LiveReload artifact in indexJsp template');
}
EOF

echo "Template asserts: OK"
