#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

node --input-type=module <<'EOF'
import { makeWatchScript } from './src/generate/watchTemplate.js';
import { makeDeployServerScript, makeDeploySelectorScript } from './src/generate/deployTemplates.js';
import {
  makeLiveReloadSnippet,
  makeAddServletScript,
  makeAddJspScript,
  makeAddServletNodeScript,
  makeAddJspNodeScript,
  makeLiveReloadClientScript
} from './src/generate/devAssets.js';
import { makeBuildScript } from './src/generate/buildTemplate.js';
import { makeNodeBuildScript, makeNodeDeployScript, makeNodeDevScript, makeNodeWatchScript } from './src/generate/scriptTemplates.js';
import { helloServlet, indexJsp } from './src/templates.js';
import { DEV_WORKER_SCRIPT_TEMPLATE, DEV_DASHBOARD_SCRIPT_TEMPLATE } from './src/generate/watchEmbeddedTemplates.js';

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
assertContains(deployTomcat, '__JWEBGEN_EVENT__ server_down', 'deploy tomcat emits server_down marker when engine is down');

const deployWildfly = makeDeployServerScript({ appName: 'appx', serverTarget: 'wildfly' });
assertContains(deployWildfly, '--cleanup-dev', 'deploy wildfly');
assertContains(deployWildfly, 'WildFly dev cleanup', 'deploy wildfly cleanup');
assertContains(deployWildfly, 'JWEBGEN_WILDFLY_DEPLOY_TIMEOUT', 'deploy wildfly timeout override');
assertContains(deployWildfly, 'JWEBGEN_FORCE_WILDFLY_REDEPLOY', 'deploy wildfly force redeploy env');
assertContains(deployWildfly, 'skipped redeploy', 'deploy wildfly skip dodeploy when unchanged');
assertContains(deployWildfly, 'cmp -s', 'deploy wildfly WAR identity via cmp not size-only');
assertContains(deployWildfly, 'DEPLOY_HTTP_OK', 'deploy wildfly HTTP probe short-circuits marker failure');
assertContains(deployWildfly, 'wildfly_cleanup_artifacts_remain', 'deploy wildfly cleanup checks all marker files');
assertContains(deployWildfly, 'wildfly_discover_home_linux', 'deploy wildfly bash discovers user opt or /opt');
const deploySelector = makeDeploySelectorScript();
assertContains(deploySelector, 'Select server target for deployment', 'deploy selector prompts target when unset');
assertContains(deploySelector, 'JWEBGEN_SERVER_TARGET', 'deploy selector persists chosen target');

const nodeBuild = makeNodeBuildScript();
assertContains(nodeBuild, '#!/usr/bin/env node', 'build.mjs shebang');
assertContains(nodeBuild, 'war:exploded', 'build.mjs runs war:exploded in dev for exploded Tomcat deploy');
assertContains(makeBuildScript(), 'package war:exploded', 'build.sh runs war:exploded when JWEBGEN_DEV=1');
assertContains(nodeBuild, 'mavenExecutable', 'build.mjs selects maven executable per OS');
assertContains(nodeBuild, 'mvn.cmd', 'build.mjs handles Windows mvn.cmd');
assertContains(nodeBuild, "from 'node:child_process'", 'build.mjs imports child_process');
assertContains(nodeBuild, 'cmd.exe', 'build.mjs run helper supports Windows wrappers');
const nodeDeploy = makeNodeDeployScript();
assertContains(nodeDeploy, 'deployTomcat', 'deploy.mjs contains tomcat deploy adapter');
assertContains(nodeDeploy, 'deployWildfly', 'deploy.mjs contains wildfly deploy adapter');
assertContains(nodeDeploy, 'readMavenAppName', 'deploy.mjs resolves deploy name from pom.xml');
assertContains(nodeDeploy, 'selectWarFile', 'deploy.mjs selects preferred WAR by app name');
assertContains(nodeDeploy, 'chooseServerTargetInteractively', 'deploy.mjs prompts target when unset');
assertContains(nodeDeploy, 'persistServerTarget', 'deploy.mjs persists chosen server target');
assertContains(nodeDeploy, 'detectServerInstalled', 'deploy.mjs validates selected server installation');
assertContains(nodeDeploy, 'maybeRunServerInstallAssistant', 'deploy.mjs offers server-focused install guidance');
assertContains(nodeDeploy, '__JWEBGEN_EVENT__ server_down', 'deploy.mjs emits server_down marker when engine is down');
assertContains(nodeDeploy, "Run: jwebgen server start ' + target", 'deploy.mjs hints server start CLI when engine is down');
assertContains(nodeDeploy, 'canAutoSudo', 'deploy.mjs can auto-detect sudo on Linux');
assertContains(nodeDeploy, "spawnSync('sudo'", 'deploy.mjs probes sudo availability');
assertContains(nodeDeploy, "spawn('sudo'", 'deploy.mjs can invoke sudo when enabled');
assertContains(nodeDeploy, "process.platform === 'linux' ? '/var/lib/tomcat10' : ''", 'deploy.mjs Linux-only Tomcat default path');
assertContains(nodeDeploy, "process.platform === 'linux' ? '/opt/wildfly' : ''", 'deploy.mjs Linux-only WildFly default path');
const nodeDev = makeNodeDevScript();
assertContains(nodeDev, 'DEV_WORKER_SCRIPT_TEMPLATE', 'dev.mjs embeds worker template');
assertContains(nodeDev, '.jwebgen-worker.mjs', 'dev.mjs writes worker script');
assertContains(nodeDev, '.jwebgen-dashboard.mjs', 'dev.mjs writes dashboard script');
assertContains(nodeDev, 'Select server target for dev', 'dev.mjs prompts target when unset');
assertContains(nodeDev, 'persistServerTarget', 'dev.mjs persists chosen server target');
assertContains(nodeDev, 'readMavenAppName', 'dev.mjs resolves app name from pom');
assertContains(nodeDev, 'JWEBGEN_APP_NAME: appName', 'dev.mjs passes app name to worker env');
assertContains(nodeDev, '.jwebgen-dev-command.json', 'dev.mjs wires UI command file for runtime control');
assertContains(nodeDev, 'maybeRunServerInstallAssistant', 'dev.mjs offers server-focused install guidance when missing');
const nodeWatch = makeNodeWatchScript();
assertContains(nodeWatch, 'dev.mjs', 'watch.mjs reuses dev.mjs runtime');

assertContains(watch, 'xmllint', 'watch resolve_app_name uses structured POM read');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, '/dev/tty', 'worker wires deploy stdin to controlling tty for sudo password');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'createProxyServer', 'worker contains dev proxy server');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, '/.jwebgen/live-reload.js', 'worker serves live-reload asset');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'waitForDevAppHttpReady', 'worker delays LiveReload until HTTP app responds after deploy');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'probeDevAppHttpOnce', 'worker probes app URL without serverUp running gate');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'spawn(process.execPath, [mjsPath]', 'worker prefers Node .mjs build/deploy when present');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, "process.platform !== 'linux'", 'worker skips systemctl when not Linux');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, "spawn('systemctl', ['is-active', '--quiet', serverUnit]", 'worker uses systemctl on Linux without bash');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'function hasCommand', 'worker probes command availability');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, "hasCommand('systemctl')", 'worker gates systemctl usage by availability');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, "hasCommand('ss')", 'worker gates ss usage by availability');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, "hasCommand('lsof')", 'worker falls back to lsof when ss unavailable');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'function hasListenerOnPort', 'worker detects listening ports on Windows/macOS');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'JWEBGEN_WILDFLY_USER_OPT_VERSION', 'worker embeds WildFly user-opt version for HOME discovery');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'spawnWinWildflyServer', 'worker defines Windows WildFly spawn helper');
assertContains(
  DEV_WORKER_SCRIPT_TEMPLATE,
  "path.join(home, 'bin', 'standalone.bat')",
  'worker probes standalone.bat for Windows WildFly start'
);
assertContains(
  DEV_WORKER_SCRIPT_TEMPLATE,
  "path.join(home, 'bin', 'standalone.ps1')",
  'worker falls back to standalone.ps1 when bat is absent'
);
{
  const w = DEV_WORKER_SCRIPT_TEMPLATE;
  const batJoin = "path.join(home, 'bin', 'standalone.bat')";
  const ps1Join = "path.join(home, 'bin', 'standalone.ps1')";
  const iBat = w.indexOf(batJoin);
  const iPs1 = w.indexOf(ps1Join);
  if (iBat === -1 || iPs1 === -1) {
    throw new Error('worker template must include both standalone.bat and standalone.ps1 path.join probes');
  }
  if (iBat >= iPs1) {
    throw new Error('worker template must probe standalone.bat before standalone.ps1 (bat-first Windows start)');
  }
}
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'server_start_throttled', 'worker throttles rapid Windows server spawn attempts');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'async function redeployOnly', 'worker can redeploy without full rebuild');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'function stopSelectedServer', 'worker stops server started from dev UI');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'spawnSync', 'worker uses sync spawn for shutdown on exit');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, "payload.cmd === 'refresh'", 'worker handles dashboard refresh command');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'healthCycleRunning', 'worker serializes server health cycles');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'stale session', 'worker saves initial state before async servers to avoid stale deploy UI');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'function pauseDevDashboard', 'worker pauses dashboard during deploy for sudo TTY');
assertContains(DEV_WORKER_SCRIPT_TEMPLATE, 'deployStillInFlight', 'worker health probe not stuck during post-deploy wait (WildFly)');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'syncDashStdinWithDeployPause', 'dashboard releases raw stdin while deploy pause file exists');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, "cmd: 'refresh'", 'dashboard queues worker refresh on key f');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'requestParentExit', 'dashboard raw stdin maps Ctrl+C to parent SIGINT');
assertContains(
  DEV_DASHBOARD_SCRIPT_TEMPLATE,
  "process.kill(parentPid, 'SIGINT');\n      process.exit(130);",
  'dashboard child exits 130 immediately after forwarding SIGINT to parent'
);

assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'function serverDownHint', 'dashboard embeds OS-aware server hints');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'JWEBGEN_SERVER_TARGET', 'dashboard distinguishes Tomcat/WildFly from env');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, "serverDownHint(", 'dashboard invokes serverDownHint from render wiring');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, "s.server === 'down'", 'dashboard ties hint to server down state');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'showStartServer', 'dashboard gates start server control on server state');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, '[s] start server', 'dashboard exposes start server label when server is down');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'sudo systemctl start tomcat10', 'dashboard linux Tomcat hint suggests sudo');
assertContains(DEV_DASHBOARD_SCRIPT_TEMPLATE, 'prefer standalone.sh', 'dashboard linux WildFly hint prefers standalone');

const client = makeLiveReloadClientScript();
assertContains(client, "searchParams.set('_jwg'", 'devAssets live reload cache-bust refresh');
assertContains(client, 'livePorts', 'devAssets live reload client fallback ports');
assertContains(client, 'location.reload(', 'devAssets live reload reload fallback');
if (String(client).includes('Date.now(')) {
  throw new Error('unexpected legacy Date.now cache-bust in live reload client');
}
if (String(client).includes('_lr')) {
  throw new Error('unexpected legacy _lr token in live reload client');
}

const snippet = makeLiveReloadSnippet();
assertContains(snippet, "searchParams.set('_jwg'", 'devAssets snippet cache-bust refresh');
assertContains(snippet, 'livePorts', 'devAssets snippet fallback ports');
assertContains(snippet, 'location.reload(', 'devAssets snippet reload fallback');
if (String(snippet).includes('Date.now(')) {
  throw new Error('unexpected legacy Date.now cache-bust in live reload snippet');
}
if (String(snippet).includes('_lr')) {
  throw new Error('unexpected legacy _lr token in live reload snippet');
}

const addServlet = makeAddServletScript({ basePackage: 'com.ex', appName: 'jwebgen' });
assertContains(addServlet, 'jwebgen --build', 'add-servlet next steps build command');
assertContains(addServlet, 'jwebgen --dev', 'add-servlet next steps dev command');
assertContains(addServlet, 'jakarta.servlet.ServletException', 'add-servlet includes ServletException import');
assertContains(addServlet, 'throws ServletException, IOException', 'add-servlet doGet throws ServletException and IOException');
assertContains(addServlet, 'urlPatterns = {"', 'add-servlet WebServlet urlPatterns is String[]');
assertContains(addServlet, 'Servlet already exists:', 'add-servlet bash fails when file exists');
assertContains(addServlet, '<html lang=en>', 'add-servlet bash html lang matches English content');
if (String(addServlet).includes('out.println("<script>")')) {
  throw new Error('unexpected inline script in add-servlet output');
}

const addJsp = makeAddJspScript({ appName: 'jwebgen' });
assertContains(addJsp, 'src/main/webapp/WEB-INF/jsp', 'add-jsp writes under WEB-INF/jsp');
assertContains(addJsp, 'if [[ "$JSP_NAME" != *.jsp ]]; then', 'add-jsp auto-appends .jsp');
assertContains(addJsp, 'JSP already exists:', 'add-jsp fails when file exists');
assertContains(addJsp, 'Usage: jwebgen --jsp <name>', 'add-jsp usage message');

const addServletNode = makeAddServletNodeScript({ basePackage: 'com.ex', appName: 'jwebgen' });
assertContains(addServletNode, '#!/usr/bin/env node', 'add-servlet.mjs shebang');
assertContains(addServletNode, 'Servlet created:', 'add-servlet.mjs output message');
assertContains(addServletNode, 'Invalid class name', 'add-servlet.mjs validation');
assertContains(addServletNode, 'Servlet already exists:', 'add-servlet.mjs fails when file exists');
assertContains(addServletNode, 'urlPatterns = {"', 'add-servlet.mjs WebServlet urlPatterns is String[]');
assertContains(addServletNode, 'String.format("<head><meta charset=UTF-8><title>%s</title></head>"', 'add-servlet.mjs title line uses String.format for valid Java');

const addJspNode = makeAddJspNodeScript({ appName: 'jwebgen' });
assertContains(addJspNode, '#!/usr/bin/env node', 'add-jsp.mjs shebang');
assertContains(addJspNode, 'JSP created:', 'add-jsp.mjs output message');
assertContains(addJspNode, 'Invalid JSP name', 'add-jsp.mjs validation');

const servlet = helloServlet({ basePackage: 'com.ex' });
const lrServlet = String(servlet);
assertContains(lrServlet, 'import jakarta.servlet.ServletException;', 'helloServlet includes ServletException import');
assertContains(lrServlet, 'throws ServletException, IOException', 'helloServlet doGet throws ServletException and IOException');
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
