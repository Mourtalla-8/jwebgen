import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeNodeBuildScript,
  makeNodeDeployScript,
  makeNodeDevScript,
  makeNodeWatchScript
} from '../../src/generate/nodeScriptTemplates.js';

test('makeNodeDeployScript uses Linux-only Tomcat/WildFly path defaults', () => {
  const s = makeNodeDeployScript();
  assert.match(s, /process\.platform === 'linux' \? '\/var\/lib\/tomcat10' : ''/);
  assert.match(s, /process\.platform === 'linux' \? '\/opt\/wildfly' : ''/);
  assert.match(s, /wildfly-as\/libexec/);
  assert.match(s, /opt\/tomcat@10\/libexec/);
});

test('makeNodeDeployScript resolves WildFly paths from resolved deployments dir', () => {
  const s = makeNodeDeployScript();
  assert.match(s, /path\.join\(resolvedDeployments, appName \+ '\.war'\)/);
  assert.match(s, /detectServerInstalled/);
  assert.match(s, /maybeRunServerInstallAssistant/);
  assert.match(s, /__JWEBGEN_EVENT__ server_down/);
  assert.match(s, /Run: jwebgen server start /);
});

test('makeNodeDevScript spawns worker without stdin and dashboard with inherited stdio', () => {
  const s = makeNodeDevScript();
  assert.match(s, /stdio: \['ignore', 'inherit', 'inherit'\]/);
  assert.match(s, /stdio: 'inherit'/);
  assert.match(s, /projectEnvFromCfg/);
  assert.match(s, /readMavenAppName/);
  assert.match(s, /JWEBGEN_APP_NAME: appName/);
  assert.match(s, /\.jwebgen-dev-command\.json/);
  assert.match(s, /maybeRunServerInstallAssistant/);
  assert.match(s, /shutdownOnce/);
  assert.match(s, /dash\.on\('exit'/);
});

test('makeNodeDevScript embeds dashboard renderer with ANSI-aware padding', () => {
  const s = makeNodeDevScript();
  assert.match(s, /stripAnsi/);
  assert.match(s, /visibleWidth/);
  assert.match(s, /padAnsi/);
  assert.match(s, /statusWidth/);
});

test('makeNodeBuildScript warns when Maven executable is missing', () => {
  const build = makeNodeBuildScript();
  assert.match(build, /looksLikeMissingMaven/);
  assert.match(build, /Maven not found/);
  assert.match(
    build,
    /Maven not found \(expected mvn\.cmd on PATH\)\. Install Apache Maven from https:\/\/maven\.apache\.org\//
  );
});

test('makeNodeDeployScript wraps deploy IO with guardedAcl for permission errors', () => {
  const deploy = makeNodeDeployScript();
  assert.match(deploy, /async function guardedAcl/);
  assert.match(deploy, /EACCES/);
  assert.match(deploy, /EPERM/);
  assert.match(deploy, /canAutoSudo/);
  assert.match(deploy, /spawnSync\('sudo'/);
  assert.match(deploy, /spawn\('sudo'/);
  assert.match(deploy, /sudoStderrMentionsNoNewPrivileges/);
  assert.match(deploy, /err\.sudoStderr/);
  assert.match(deploy, /WILDFLY_DEPLOYMENTS/);
  assert.match(deploy, /TOMCAT_HOME\/TOMCAT10\/CATALINA_HOME/);
  assert.match(deploy, /validateTomcatHome/);
  assert.match(deploy, /validateWildflyDeployments/);
});

test('makeNodeDeployScript guards runtime probes by command availability', () => {
  const deploy = makeNodeDeployScript();
  assert.match(deploy, /const hasCommand = \(bin\)/);
  assert.match(deploy, /hasCommand\('powershell\.exe'\)/);
  assert.match(deploy, /hasCommand\('pgrep'\)/);
  assert.match(deploy, /hasCommand\('curl'\)/);
  assert.match(deploy, /hasCommand\('systemctl'\)/);
});

test('makeNodeDeployScript enforces Tomcat reloadable context in dev mode', () => {
  const deploy = makeNodeDeployScript();
  assert.match(deploy, /ensureTomcatDevReloadableContext/);
  assert.match(deploy, /<Context reloadable="true" \/>/);
  assert.match(deploy, /deploy \(set Tomcat reloadable=true\)/);
});

test('makeNodeBuildScript and watch delegate stay Node-first', () => {
  assert.match(makeNodeBuildScript(), /mvn\.cmd/);
  const watch = makeNodeWatchScript();
  assert.match(watch, /dev\.mjs/);
  assert.match(watch, /stdio: 'inherit'/);
});
