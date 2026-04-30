#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

node --input-type=module <<'EOF'
import { makeWatchScript } from './src/generate/watchTemplate.js';
import { makeDeployServerScript } from './src/generate/deployTemplates.js';
import { makeLiveReloadSnippet } from './src/generate/devAssets.js';
import { helloServlet, indexJsp } from './src/templates.js';

function assertContains(haystack, needle, label) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`missing [${needle}] in ${label}`);
  }
}

const watch = makeWatchScript();
assertContains(watch, 'DEV_PID_FILE=', 'watch.sh');
assertContains(watch, 'cleanup_orphan_dev_session', 'watch.sh');
assertContains(watch, 'scripts/deploy.sh" --cleanup-dev', 'watch.sh');
assertContains(watch, '"$UI_PAUSE_FILE" "$$"', 'watch worker/dashboard parent pid');
assertContains(watch, '[i]inspecter / [x]kill port / [c]hange port / [f]refresh / [a]ide / [q]uit', 'watch staged kill options');
assertContains(watch, '[r]redéployer+redémarrer / [i]inspecter / [f]refresh / [a]ide / [q]uit', 'watch wildfly http000 restart-first options');
assertContains(watch, 'Déploiement en erreur. [s]udo / [f]refresh / [a]ide / [q]uit', 'watch deploy sudo remediation options');
assertContains(watch, "Option non disponible dans ce menu.", 'watch strict key parser');
if (String(watch).includes('[r]etester')) {
  throw new Error('unexpected retester option in watch.sh');
}

const deployTomcat = makeDeployServerScript({ appName: 'appx', serverTarget: 'tomcat' });
assertContains(deployTomcat, '--cleanup-dev', 'deploy tomcat');
assertContains(deployTomcat, 'Nettoyage dev Tomcat', 'deploy tomcat cleanup');

const deployWildfly = makeDeployServerScript({ appName: 'appx', serverTarget: 'wildfly' });
assertContains(deployWildfly, '--cleanup-dev', 'deploy wildfly');
assertContains(deployWildfly, 'Nettoyage dev WildFly', 'deploy wildfly cleanup');

const snippet = makeLiveReloadSnippet();
assertContains(snippet, "_lr=' + Date.now()", 'devAssets snippet cache buster');
assertContains(snippet, 'livePorts', 'devAssets snippet fallback ports');

const servlet = helloServlet({ basePackage: 'com.ex' });
assertContains(servlet, "_lr=' + Date.now()", 'helloServlet snippet cache buster');

const jsp = indexJsp({ projectName: 'x', artifactId: 'x', hasServlet: true });
assertContains(jsp, "_lr=' + Date.now()", 'indexJsp snippet cache buster');
EOF

echo "Template asserts: OK"
