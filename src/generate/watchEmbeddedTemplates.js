import { WINDOWS_WILDFLY_PORTABLE_VERSION } from '../project/windowsSetupInstall.js';
import { embedWinWildflySpawnFunctionSource } from '../project/winWildflyStart.js';

export const DEV_WORKER_SCRIPT_TEMPLATE = `import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { readdirSync, statSync, watch as fsWatch, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';

const JWEBGEN_WILDFLY_USER_OPT_VERSION = '${WINDOWS_WILDFLY_PORTABLE_VERSION}';

const root = process.cwd();
const stateFile = process.argv[2];
const eventsFile = process.argv[3];
const pauseFile = process.argv[4];
const parentPid = Number(process.argv[5] || 0);
const commandFile = process.argv[6] || '';
const verbose = process.env.JWEBGEN_VERBOSE === '1';
const serverTarget = process.env.JWEBGEN_SERVER_TARGET || 'tomcat';
const appName = process.env.JWEBGEN_APP_NAME || 'app';
const httpPort = Number(process.env.JWEBGEN_HTTP_PORT || 8080);
const serverUnit =
  serverTarget === 'wildfly'
    ? 'wildfly'
    : 'tomcat10';
const preferredLivePort = Number(process.env.JWEBGEN_LIVE_PORT || 35729);
let livePort = preferredLivePort;
const preferredProxyPort = Number(process.env.JWEBGEN_PROXY_PORT || 8081);
let proxyPort = preferredProxyPort;
const wsClients = new Set();

const state = {
  phase: 'idle',
  build: 'pending',
  deploy: 'pending',
  server: 'checking',
  app: 'checking',
  live: 'starting',
  url: 'http://localhost:' + proxyPort + '/' + appName + '/',
  appUrl: 'http://localhost:' + httpPort + '/' + appName + '/',
  proxyUrl: 'http://localhost:' + proxyPort + '/' + appName + '/',
  serverCheckUrl: serverTarget === 'wildfly' ? 'http://127.0.0.1:9990' : 'http://127.0.0.1:' + httpPort,
  livePort,
  proxyPort
};
let startInProgress = false;
let serverStartedByDev = false;
let lastWinServerSpawnMs = 0;
const WIN_SERVER_SPAWN_COOLDOWN_MS = 20000;
let redeployRetryScheduled = false;
function syncPublicUrls() {
  state.proxyUrl = 'http://localhost:' + proxyPort + '/' + appName + '/';
  state.appUrl = 'http://localhost:' + httpPort + '/' + appName + '/';
  state.url = state.proxyUrl;
}
function saveState() { writeFileSync(stateFile, JSON.stringify(state), 'utf8'); }
function emit(type, details = {}) { appendFileSync(eventsFile, JSON.stringify({ type, ts: Date.now(), ...details }) + '\\n', 'utf8'); }
// Before WS/proxy bind, the dashboard may already read stateFile - overwrite any stale session (e.g. deploy: error).
saveState();
function parseListenOwner(text, port) {
  const lines = String(text || '').split('\\n');
  for (const line of lines) {
    if (!line.includes('LISTEN')) continue;
    if (line.includes(':' + String(port))) return line.trim();
  }
  return '';
}
function hasCommand(bin) {
  return new Promise((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    probe.on('error', () => resolve(false));
    probe.on('exit', (code) => resolve(code === 0));
  });
}
function portOwner(port) {
  return new Promise((resolve) => {
    hasCommand('ss').then((ssAvailable) => {
      const runLsofFallback = () => {
        hasCommand('lsof').then((lsofAvailable) => {
          if (!lsofAvailable) return resolve(null);
          const lsof = spawn('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'ignore'] });
          let lsofOut = '';
          lsof.stdout.on('data', (c) => { lsofOut += String(c); });
          lsof.on('error', () => resolve(null));
          lsof.on('exit', () => {
            const line = String(lsofOut || '').split('\\n')[1];
            resolve(line ? line.trim() : null);
          });
        }).catch(() => resolve(null));
      };
      if (!ssAvailable) return runLsofFallback();
      const ss = spawn('ss', ['-lntp'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      ss.stdout.on('data', (c) => { out += String(c); });
      ss.on('error', () => runLsofFallback());
      ss.on('exit', (code) => {
        if (code === 0) {
          const owner = parseListenOwner(out, port);
          if (owner) return resolve(owner);
        }
        runLsofFallback();
      });
    }).catch(() => resolve(null));
  });
}
function hasListenerOnPort(port) {
  return new Promise((resolve) => {
    const p = Number(port);
    if (!Number.isFinite(p) || p <= 0) return resolve(false);
    if (process.platform === 'win32') {
      const ns = spawn('netstat', ['-ano'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      ns.stdout.on('data', (c) => { out += String(c); });
      ns.on('error', () => resolve(false));
      ns.on('exit', () => {
        const portStr = String(p);
        for (const line of out.split(/\\r?\\n/)) {
          if (!/LISTENING/i.test(line)) continue;
          if (line.includes(':' + portStr) || line.includes('[::]:' + portStr) || line.includes(']:' + portStr)) {
            return resolve(true);
          }
        }
        resolve(false);
      });
      return;
    }
    hasCommand('lsof').then((ok) => {
      if (!ok) return resolve(false);
      const lf = spawn('lsof', ['-nP', '-iTCP:' + p, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let buf = '';
      lf.stdout.on('data', (c) => { buf += String(c); });
      lf.on('error', () => resolve(false));
      lf.on('exit', (code) => resolve(code === 0 && buf.trim().length > 0));
    }).catch(() => resolve(false));
  });
}
function resolveTomcatHome() {
  return String(process.env.TOMCAT_HOME || process.env.TOMCAT10 || process.env.CATALINA_HOME || '').trim();
}
function resolveWildflyHome() {
  const fromEnv = String(process.env.WILDFLY_HOME || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== 'linux') return '';
  const homeDir = String(process.env.HOME || '').trim();
  if (!homeDir) return '';
  const optDir = path.join(homeDir, 'opt');
  if (!existsSync(optDir)) return '';
  const preferred = path.join(optDir, 'wildfly-' + JWEBGEN_WILDFLY_USER_OPT_VERSION);
  if (existsSync(path.join(preferred, 'jboss-modules.jar'))) return path.resolve(preferred);
  let best = '';
  try {
    for (const ent of readdirSync(optDir, { withFileTypes: true })) {
      if (!ent.isDirectory() || !ent.name.startsWith('wildfly-')) continue;
      const full = path.join(optDir, ent.name);
      if (!existsSync(path.join(full, 'jboss-modules.jar'))) continue;
      if (!best || ent.name.localeCompare(path.basename(best)) > 0) best = full;
    }
  } catch {
    return '';
  }
  return best ? path.resolve(best) : '';
}
function runAndWait(command, args = []) {
  return new Promise((resolve) => {
    const p = spawn(command, args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}
function runDetached(command, args = [], opts = {}) {
  try {
    const p = spawn(command, args, { detached: true, stdio: 'ignore', shell: false, ...opts });
    p.on('error', () => {});
    p.unref();
    return true;
  } catch {
    return false;
  }
}
function spawnWinServerBatch(home, batchRel) {
  try {
    const p = spawn('cmd.exe', ['/d', '/c', 'call', batchRel], {
      cwd: home,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    p.on('error', () => {});
    p.unref();
    return true;
  } catch {
    return false;
  }
}
${embedWinWildflySpawnFunctionSource()}
function stopSelectedServer() {
  if (!serverStartedByDev) return;
  try {
    if (serverTarget === 'tomcat') {
      const home = resolveTomcatHome();
      if (home) {
        if (process.platform === 'win32') {
          spawnSync('cmd.exe', ['/d', '/c', 'call', 'bin\\\\shutdown.bat'], {
            cwd: home,
            stdio: 'ignore',
            windowsHide: true,
            timeout: 25000
          });
        } else {
          const sh = path.join(home, 'bin', 'shutdown.sh');
          if (existsSync(sh)) {
            spawnSync(sh, [], { cwd: home, stdio: 'ignore', timeout: 25000 });
          }
        }
      }
    } else if (serverTarget === 'wildfly') {
      const home = resolveWildflyHome();
      if (home) {
        if (process.platform === 'win32') {
          const cliBat = path.join(home, 'bin', 'jboss-cli.bat');
          if (existsSync(cliBat)) {
            spawnSync('cmd.exe', ['/d', '/c', 'call', 'bin\\\\jboss-cli.bat', '--connect', '--command=:shutdown'], {
              cwd: home,
              stdio: 'ignore',
              windowsHide: true,
              timeout: 25000
            });
          }
        } else {
          const cliSh = path.join(home, 'bin', 'jboss-cli.sh');
          if (existsSync(cliSh)) {
            spawnSync(cliSh, ['--connect', '--command=:shutdown'], { cwd: home, stdio: 'ignore', timeout: 25000 });
          }
        }
      }
    }
  } catch {}
  serverStartedByDev = false;
}
async function startSelectedServer() {
  if (startInProgress) return;
  startInProgress = true;
  emit('server_start_requested', { target: serverTarget });
  try {
    let started = false;
    let markStartedByUs = false;
    if (process.platform === 'win32') {
      const now = Date.now();
      if (lastWinServerSpawnMs > 0 && now - lastWinServerSpawnMs < WIN_SERVER_SPAWN_COOLDOWN_MS) {
        emit('server_start_throttled', { target: serverTarget, cooldownMs: WIN_SERVER_SPAWN_COOLDOWN_MS });
        return;
      }
    }
    if (process.platform === 'linux' && await hasCommand('systemctl')) {
      const unit = serverTarget === 'wildfly' ? 'wildfly' : 'tomcat10';
      started = await runAndWait('systemctl', ['start', unit]);
      if (!started && serverTarget === 'tomcat') started = await runAndWait('systemctl', ['start', 'tomcat']);
    }
    if (!started && serverTarget === 'tomcat') {
      const home = resolveTomcatHome();
      if (home) {
        if (process.platform === 'win32') {
          started = spawnWinServerBatch(home, 'bin\\\\startup.bat');
          if (started) {
            markStartedByUs = true;
            lastWinServerSpawnMs = Date.now();
          }
        } else {
          started = runDetached(path.join(home, 'bin', 'startup.sh'), []);
          if (!started) started = runDetached(path.join(home, 'bin', 'catalina.sh'), ['start']);
          if (started) markStartedByUs = true;
        }
      }
    }
    if (!started && serverTarget === 'wildfly') {
      const home = resolveWildflyHome();
      if (home) {
        if (process.platform === 'win32') {
          started = spawnWinWildflyServer(home);
          if (started) {
            markStartedByUs = true;
            lastWinServerSpawnMs = Date.now();
          }
        } else {
          started = runDetached(path.join(home, 'bin', 'standalone.sh'), []);
          if (started) markStartedByUs = true;
        }
      }
    }
    if (!started) {
      emit('server_start_failed', { target: serverTarget, reason: 'no_supported_start_method' });
      const hint =
        '[jwebgen dev] Could not start ' +
        serverTarget +
        ' (needs systemctl permissions, or set WILDFLY_HOME / TOMCAT_HOME / CATALINA_HOME). Try: jwebgen server start ' +
        serverTarget;
      console.error(hint);
      if (process.platform === 'win32') {
        console.error(
          '[jwebgen dev] On Windows, ensure JAVA_HOME points to a JDK and run standalone.bat or startup.bat from the server bin folder once to verify.'
        );
      }
      return;
    }
    if (markStartedByUs) serverStartedByDev = true;
    emit('server_start_triggered', { target: serverTarget });
    await new Promise((r) => setTimeout(r, 1000));
    const check = await serverUp();
    if (check.ok) emit('server_start_ok', { target: serverTarget });
    else emit('server_start_pending', { target: serverTarget, status: check.status || 'down' });
  } finally {
    startInProgress = false;
  }
}
function findFreePort(startAt) {
  return new Promise((resolve) => {
    const max = startAt + 50;
    let p = startAt;
    const tryNext = () => {
      if (p > max) return resolve(null);
      const s = net.createServer();
      s.once('error', () => { p += 1; tryNext(); });
      s.once('listening', () => s.close(() => resolve(p)));
      s.listen(p, '127.0.0.1');
    };
    tryNext();
  });
}
function wsAccept(key) {
  return crypto.createHash('sha1').update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary').digest('base64');
}
function wsSend(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  const header = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, (payload.length >> 8) & 0xff, payload.length & 0xff]);
  socket.write(Buffer.concat([header, payload]));
}
function injectLiveReload(html, tag) {
  const lower = String(html).toLowerCase();
  const idx = lower.lastIndexOf('</body>');
  if (idx < 0) return String(html) + tag;
  return String(html).slice(0, idx) + tag + String(html).slice(idx);
}
function proxyScriptTag() {
  return '<script>window.__JWEBGEN_LIVE_PORT=' + String(livePort) + ';</script><script src=\"/.jwebgen/live-reload.js\"></script>';
}
function serveProxyClient(res) {
  const assetPath = path.join(root, '.jwebgen', 'live-reload.js');
  if (!existsSync(assetPath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('missing .jwebgen/live-reload.js\\n');
    return;
  }
  const body = readFileSync(assetPath, 'utf8');
  res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function createProxyServer() {
  return http.createServer((req, res) => {
    const url = String(req.url || '/');
    if (url.startsWith('/.jwebgen/live-reload.js')) return serveProxyClient(res);
    // Pass-through proxy to local server, injecting only for HTML.
    const upstreamHeaders = { ...req.headers };
    upstreamHeaders.host = req.headers.host || upstreamHeaders.host;
    upstreamHeaders['accept-encoding'] = 'identity';
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: httpPort,
        method: req.method || 'GET',
        path: url,
        headers: upstreamHeaders
      },
      (up) => {
        const ct = String(up.headers['content-type'] || '');
        const isHtml = ct.toLowerCase().includes('text/html');
        if (!isHtml) {
          res.writeHead(up.statusCode || 200, up.headers);
          up.pipe(res);
          return;
        }
        if (req.method === 'HEAD' || [204, 304].includes(up.statusCode)) {
          res.writeHead(up.statusCode || 200, up.headers);
          up.pipe(res);
          return;
        }
        // Force identity transfer/encoding and strip compression metadata for HTML
        delete up.headers['transfer-encoding'];
        delete up.headers['content-encoding'];
        delete up.headers['content-length'];
        delete up.headers['te'];
        delete up.headers['vary'];
        let body = '';
        let truncated = false;
        up.setEncoding('utf8');
        up.on('data', (c) => {
          if (truncated) return;
          body += String(c);
          if (body.length > 2_000_000) {
            // Safety cap: do not buffer unbounded responses.
            if (!truncated) {
              console.warn('[jwebgen] Response body exceeds 2MB limit, replacing with fallback HTML');
              truncated = true;
            }
            body = '<!doctype html><html><body><h1>Content too large</h1></body></html>';
          }
        });
        up.on('end', () => {
          const injected = injectLiveReload(body, proxyScriptTag());
          const headers = { ...up.headers };
          delete headers['transfer-encoding'];
          delete headers['content-encoding'];
          delete headers['content-length'];
          delete headers['te'];
          delete headers['vary'];
          // Remove cache validators so browsers don't reuse cached HTML with old injected port
          delete headers['etag'];
          delete headers['last-modified'];
          delete headers['if-none-match'];
          delete headers['if-modified-since'];
          delete headers['content-security-policy'];
          delete headers['content-security-policy-report-only'];
          headers['cache-control'] = 'no-store';
          headers['pragma'] = 'no-cache';
          headers['expires'] = '0';
          res.writeHead(up.statusCode || 200, headers);
          res.end(injected, 'utf8');
        });
      }
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('proxy error\\n');
    });
    req.pipe(upstream);
  });
}
function notifyReload() {
  const msg = JSON.stringify({ command: 'reload' });
  for (const s of wsClients) { try { wsSend(s, msg); } catch {} }
}
function listenOnce(server, port, host) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => {
      server.removeListener('listening', onOk);
      reject(e);
    };
    const onOk = () => {
      server.removeListener('error', onErr);
      resolve();
    };
    server.once('error', onErr);
    server.once('listening', onOk);
    if (host) server.listen(port, host);
    else server.listen(port);
  });
}
async function startProxyServer() {
  let candidate = preferredProxyPort;
  for (let tries = 0; tries < 60; tries++) {
    let bound = false;
    for (let stall = 0; stall < 14; stall++) {
      try {
        await listenOnce(proxy, candidate, '127.0.0.1');
        bound = true;
        break;
      } catch (err) {
        if (err?.code !== 'EADDRINUSE') {
          console.error('[jwebgen] Proxy server error:', err);
          process.exit(1);
        }
        await new Promise((r) => setTimeout(r, 70 + stall * 45));
      }
    }
    if (bound) {
      proxyPort = candidate;
      state.proxyPort = proxyPort;
      syncPublicUrls();
      saveState();
      return;
    }
    const owner = await portOwner(candidate);
    emit('proxy_port_busy', { port: candidate, owner: owner || '' });
    const next = await findFreePort(candidate + 1);
    if (!next) {
      console.error('[jwebgen] Proxy server error: no free port for fallback');
      process.exit(1);
    }
    emit('proxy_port_fallback', { fromPort: candidate, toPort: next });
    candidate = next;
  }
  console.error('[jwebgen] Proxy server error: could not bind after retries');
  process.exit(1);
}
const wsServer = http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('jwebgen live\\n');
});
wsServer.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = wsAccept(key);
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
  wsClients.add(socket);
  socket.on('close', () => wsClients.delete(socket));
  socket.on('error', () => wsClients.delete(socket));
});
async function startWsServer() {
  let candidate = preferredLivePort;
  for (let tries = 0; tries < 60; tries++) {
    try {
      await listenOnce(wsServer, candidate, '127.0.0.1');
      livePort = candidate;
      state.livePort = livePort;
      state.live = 'ready (ws://localhost:' + livePort + ')';
      saveState();
      return;
    } catch (err) {
      if (err?.code !== 'EADDRINUSE') {
        state.live = 'error';
        saveState();
        return;
      }
      const owner = await portOwner(candidate);
      emit('live_port_busy', { port: candidate, owner: owner || '' });
      const next = await findFreePort(candidate + 1);
      if (!next) {
        state.live = 'error';
        saveState();
        return;
      }
      emit('live_port_fallback', { fromPort: candidate, toPort: next });
      candidate = next;
    }
  }
  state.live = 'error';
  saveState();
}
startWsServer().catch(() => {});
const proxy = createProxyServer();
startProxyServer().catch(() => process.exit(1));
process.on('exit', () => { try { proxy.close(); } catch {} });
process.on('exit', () => { try { wsServer.close(); } catch {} });
if (parentPid > 1) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      stopSelectedServer();
      process.exit(0);
    }
  }, 1500).unref();
}

process.on('SIGINT', () => {
  stopSelectedServer();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopSelectedServer();
  process.exit(143);
});

let running = false;
let queued = false;
let timer = null;
let lastBuildQueuedAt = 0;
let lastDeployFinishedAt = 0;
let deployOnlyBusy = false;
const DOUBLE_RELOAD = process.env.JWEBGEN_DOUBLE_RELOAD === '1';
/** After deploy.sh exits, the app server may still be installing the WAR; wait until HTTP answers before LiveReload. */
const POST_DEPLOY_READY_MS = Math.max(2000, Math.min(120000, Number(process.env.JWEBGEN_POST_DEPLOY_READY_MS || 90000) || 90000));
const POST_DEPLOY_POLL_MS = Math.max(100, Math.min(3000, Number(process.env.JWEBGEN_POST_DEPLOY_POLL_MS || 350) || 350));
const POST_DEPLOY_READY_DISABLE = String(process.env.JWEBGEN_POST_DEPLOY_READY_WAIT || '').trim() === '0';
function probeDevAppHttpOnce() {
  return new Promise((resolve) => {
    const appUrl = new URL('/' + appName + '/', 'http://127.0.0.1:' + httpPort).toString();
    const req = http.request(appUrl, { method: 'GET', timeout: 2000, headers: { 'accept-encoding': 'identity' } }, (res) => {
      const code = Number(res.statusCode || 0);
      res.resume();
      resolve(code >= 200 && code < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      try { req.destroy(); } catch {}
      resolve(false);
    });
    req.end();
  });
}
async function waitForDevAppHttpReady() {
  if (POST_DEPLOY_READY_DISABLE) return;
  const deadline = Date.now() + POST_DEPLOY_READY_MS;
  while (Date.now() < deadline) {
    if (await probeDevAppHttpOnce()) return;
    await new Promise((r) => setTimeout(r, POST_DEPLOY_POLL_MS));
  }
  try {
    emit('live_reload_ready_timeout', { waitedMs: POST_DEPLOY_READY_MS, app: appName, port: httpPort });
  } catch {}
}
async function rebuild() {
  if (running) { queued = true; return; }
  if (deployOnlyBusy) { queued = true; return; }
  running = true;
  state.phase = 'running'; state.build = 'running'; state.deploy = 'pending'; saveState();
  try {
    await runScript('build.sh');
    state.build = 'ok'; state.deploy = 'running'; saveState();
    pauseDevDashboard();
    try {
      if (process.platform !== 'win32') {
        console.error('\\n[jwebgen --dev] Sudo may ask for your password below (dashboard paused so it is visible).\\n');
      }
      await runScript('deploy.sh');
    } finally {
      resumeDevDashboard();
    }
    state.deploy = 'ok';
    saveState();
    await waitForDevAppHttpReady();
    state.phase = 'idle';
    lastDeployFinishedAt = Date.now();
    saveState();
    notifyReload();
    if (DOUBLE_RELOAD) setTimeout(() => notifyReload(), 600);
  } catch (err) {
    const msg = String(err?.message || '');
    const failedDuringDeploy = state.deploy === 'running';
    if (msg.includes('__JWEBGEN_EVENT__ server_down')) emit('server_down');
    if (msg.includes('__JWEBGEN_EVENT__ deploy_sudo_required')) emit('deploy_sudo_required');
    if (failedDuringDeploy && !msg.includes('__JWEBGEN_EVENT__ deploy_sudo_required')) emit('deploy_error');
    state.phase = 'idle';
    if (state.build === 'running') state.build = 'error';
    if (state.deploy === 'running') state.deploy = 'error';
    saveState();
  } finally {
    running = false;
    if (queued) { queued = false; queueRebuild(); }
  }
}
async function redeployOnly() {
  if (deployOnlyBusy || running) return;
  deployOnlyBusy = true;
  state.phase = 'running';
  state.deploy = 'running';
  saveState();
  pauseDevDashboard();
  try {
    if (process.platform !== 'win32') {
      console.error('\\n[jwebgen --dev] Sudo may ask for your password below (dashboard paused so it is visible).\\n');
    }
    await runScript('deploy.sh');
    state.deploy = 'ok';
    saveState();
    await waitForDevAppHttpReady();
    state.phase = 'idle';
    lastDeployFinishedAt = Date.now();
    saveState();
    notifyReload();
    if (DOUBLE_RELOAD) setTimeout(() => notifyReload(), 600);
  } catch (err) {
    const msg = String(err?.message || '');
    const failedDuringDeploy = state.deploy === 'running';
    if (msg.includes('__JWEBGEN_EVENT__ server_down')) emit('server_down');
    if (msg.includes('__JWEBGEN_EVENT__ deploy_sudo_required')) emit('deploy_sudo_required');
    if (failedDuringDeploy && !msg.includes('__JWEBGEN_EVENT__ deploy_sudo_required')) emit('deploy_error');
    state.phase = 'idle';
    if (state.deploy === 'running') state.deploy = 'error';
    saveState();
  } finally {
    resumeDevDashboard();
    deployOnlyBusy = false;
    if (queued) {
      queued = false;
      void rebuild();
    }
  }
}
function queueRebuild() {
  if (running) {
    queued = true;
    return;
  }
  const now = Date.now();
  // Protect against very bursty editor writes (tmp swap, multi-write saves).
  if (now - lastBuildQueuedAt < 200) return;
  lastBuildQueuedAt = now;
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(), 400);
}
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
const watched = new Map();
const srcDirPrefix = path.join(root, 'src') + path.sep;
function isUnderSrc(fullPath) {
  const norm = fullPath.replace(/\\\\/g, '/');
  const pref = srcDirPrefix.replace(/\\\\/g, '/');
  return norm === pref.slice(0, -1) || norm.startsWith(pref);
}
const RELOAD_RELEVANT_EXT = new Set([
  '.java', '.jsp', '.jspx', '.tag', '.tagx',
  '.html', '.xhtml', '.css', '.js', '.mjs',
  '.ts', '.tsx', '.json', '.xml', '.properties'
]);
function shouldTriggerRebuild(dir, fileName) {
  const name = String(fileName || '');
  if (name === '' || name.startsWith('.jwebgen') || name.startsWith('.#')) return false;
  if (name.endsWith('.swp') || name.endsWith('.tmp') || name.endsWith('~') || name.endsWith('.war')) return false;
  const full = path.join(dir, name);
  if (full.includes('/target/')) return false;
  if (name === 'pom.xml') return full === path.join(root, 'pom.xml');
  if (name === 'web.xml' || name === 'context.xml') return isUnderSrc(full);
  const ext = path.extname(name).toLowerCase();
  if (!RELOAD_RELEVANT_EXT.has(ext)) return false;
  return isUnderSrc(full);
}
function walkAndWatch(dir) {
  if (!isDir(dir)) return;
  if (!watched.has(dir)) {
    try {
      const w = fsWatch(dir, { persistent: true }, (_ev, fileName) => {
        if (!shouldTriggerRebuild(dir, fileName)) return;
        queueRebuild();
      });
      watched.set(dir, w);
    } catch {}
  }
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'target' || name === '.jwebgen') continue;
    const full = path.join(dir, name);
    if (isDir(full)) walkAndWatch(full);
  }
}

function pauseDevDashboard() {
  if (!pauseFile) return;
  try {
    writeFileSync(pauseFile, 'deploy', 'utf8');
  } catch {}
}
function resumeDevDashboard() {
  if (!pauseFile) return;
  try {
    rmSync(pauseFile, { force: true });
  } catch {}
}

function runScript(script) {
  return new Promise((resolve, reject) => {
    const scriptsDir = path.join(root, '.jwebgen', 'scripts');
    const mjsName = script.replace(/\\.sh$/, '.mjs');
    const mjsPath = path.join(scriptsDir, mjsName);
    const shPath = path.join(scriptsDir, script);
    const useNode = existsSync(mjsPath);
    let ttyIn = null;
    const cleanupTtyFd = () => {
      if (ttyIn != null) {
        try {
          closeSync(ttyIn);
        } catch {}
        ttyIn = null;
      }
    };
    const deployNeedsSudoTty = script === 'deploy.sh' && process.platform !== 'win32';
    if (deployNeedsSudoTty) {
      try {
        ttyIn = openSync('/dev/tty', 'r');
      } catch {
        ttyIn = null;
      }
    }
    const stdioFromTty = ttyIn != null ? [ttyIn, 'inherit', 'inherit'] : null;
    const stdioDefault = verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'];
    const stdio = stdioFromTty != null ? stdioFromTty : stdioDefault;
    const p = useNode
      ? spawn(process.execPath, [mjsPath], { cwd: root, stdio, shell: false })
      : spawn(shPath, [], { cwd: root, stdio, shell: false });
    let logs = '';
    if (!verbose) {
      p.stdout?.on('data', (c) => { logs += String(c); if (logs.length > 20000) logs = logs.slice(-20000); });
      p.stderr?.on('data', (c) => { logs += String(c); if (logs.length > 20000) logs = logs.slice(-20000); });
    }
    p.on('error', (err) => {
      cleanupTtyFd();
      reject(err);
    });
    p.on('exit', (code) => {
      cleanupTtyFd();
      if (code === 0) resolve();
      else reject(new Error((logs || script + ' failed').trim()));
    });
  });
}
function serverUp() {
  return new Promise((resolve) => {
    const appUrl = new URL('/' + appName + '/', 'http://127.0.0.1:' + httpPort).toString();
    const req = http.request(appUrl, { method: 'GET', timeout: 1500, headers: { 'accept-encoding': 'identity' } }, (res) => {
      const code = Number(res.statusCode || 0);
      res.resume();
      if (code >= 200 && code < 400) return resolve({ ok: true, status: 'up' });
      checkEngine();
    });
    req.on('error', () => checkEngine());
    req.on('timeout', () => { req.destroy(); checkEngine(); });
    req.end();

    function checkEngine() {
      const deployStillInFlight = (running || deployOnlyBusy) && state.deploy !== 'ok';
      if (deployStillInFlight) {
        return resolve({ ok: false, status: 'starting' });
      }
      if (serverTarget === 'wildfly') {
        const mgmtReq = http.request('http://127.0.0.1:9990/', { method: 'GET', timeout: 1500, headers: { 'accept-encoding': 'identity' } }, (mgmtRes) => {
          mgmtRes.resume();
          if (Number(mgmtRes.statusCode || 0) > 0) return resolve({ ok: true, status: 'app_down_000', httpStatus: 0 });
          checkPortOwner();
        });
        const wildflyMgmtDown = () => {
          hasListenerOnPort(9990).then((listening) => {
            if (listening) return resolve({ ok: true, status: 'app_down_000', httpStatus: 0 });
            checkPortOwner();
          });
        };
        mgmtReq.on('error', wildflyMgmtDown);
        mgmtReq.on('timeout', () => { mgmtReq.destroy(); wildflyMgmtDown(); });
        mgmtReq.end();
        return;
      }
      if (process.platform !== 'linux') {
        hasListenerOnPort(httpPort).then((listening) => {
          if (listening) return resolve({ ok: true, status: 'app_down' });
          checkPortOwner();
        });
        return;
      }
      hasCommand('systemctl').then((available) => {
        if (!available) return checkPortOwner();
        const p = spawn('systemctl', ['is-active', '--quiet', serverUnit], { stdio: 'ignore' });
        p.on('error', () => checkPortOwner());
        p.on('exit', (code) => {
          if (code === 0) return resolve({ ok: true, status: 'app_down' });
          checkPortOwner();
        });
      }).catch(() => checkPortOwner());
    }
    async function checkPortOwner() {
      const owner = await portOwner(httpPort);
      if (owner) return resolve({ ok: false, status: 'port_conflict', owner });
      resolve({ ok: false, status: 'down' });
    }
  });
}
function nextAppState(status) {
  if (status === 'up') return 'up';
  if (status === 'app_down') return 'down';
  if (status === 'app_down_000') return 'down';
  if (status === 'starting') return 'checking';
  return 'unknown';
}
let lastStatus = '';
let healthCycleRunning = false;
async function runServerHealthCycle() {
  if (healthCycleRunning) return;
  healthCycleRunning = true;
  try {
    const prevS = state.server;
    const prevA = state.app;
    const check = await serverUp();
    const nextServer = check.status === 'starting' ? 'checking' : (check.ok ? 'up' : 'down');
    const nextApp = nextAppState(check.status);
    let changed = false;
    if (state.server !== nextServer) { state.server = nextServer; changed = true; }
    if (state.app !== nextApp) { state.app = nextApp; changed = true; }
    if (changed) saveState();
    const serverRecovered =
      (prevS === 'down' || prevS === 'checking') && nextServer === 'up';
    const appRecovered =
      nextServer === 'up'
      && (prevA === 'down' || prevA === 'checking')
      && nextApp === 'up';
    if (
      state.deploy === 'error'
      && (serverRecovered || appRecovered)
      && !running
      && !deployOnlyBusy
      && !redeployRetryScheduled
    ) {
      redeployRetryScheduled = true;
      void (async () => {
        try {
          if (state.build === 'ok') await redeployOnly();
          else queueRebuild();
        } finally {
          redeployRetryScheduled = false;
        }
      })();
    }
    if (check.status !== lastStatus) {
      lastStatus = check.status;
      if (check.status === 'port_conflict') emit('http_port_conflict', { port: httpPort, owner: check.owner || '' });
      else if (check.status === 'down') emit('server_down', { reason: check.status, port: httpPort });
      else if (check.status === 'app_down' || check.status === 'app_down_000') {
        emit('app_unreachable', { port: httpPort, app: appName, httpStatus: check.httpStatus || 0 });
      }
    }
  } finally {
    healthCycleRunning = false;
  }
}
setInterval(() => { void runServerHealthCycle(); }, 1200).unref();
function processUiCommand() {
  if (!commandFile || !existsSync(commandFile)) return;
  let raw = '';
  try {
    raw = readFileSync(commandFile, 'utf8');
  } catch {
    return;
  }
  try { rmSync(commandFile, { force: true }); } catch {}
  let payload = null;
  try { payload = JSON.parse(String(raw || '{}')); } catch { payload = null; }
  if (!payload || !payload.cmd) return;
  if (payload.cmd === 'refresh') {
    void runServerHealthCycle();
    return;
  }
  if (payload.cmd === 'start_server') void startSelectedServer();
}
setInterval(() => {
  processUiCommand();
}, 350).unref();
walkAndWatch(root);
// Keep watcher coverage up to date when new directories appear.
setInterval(() => {
  walkAndWatch(root);
}, 9000).unref();
saveState();
rebuild();
`;

export const DEV_DASHBOARD_SCRIPT_TEMPLATE = `import { existsSync, readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

const stateFile = process.argv[2];
const pauseFile = process.argv[3];
const commandFile = process.argv[4] || '';
const parentPid = Number(process.argv[5] || 0);
const isTTY = process.stderr.isTTY;
if (!isTTY) process.exit(0);
function color(code, text) { return '\\x1b[' + code + 'm' + text + '\\x1b[0m'; }
function loadState() { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } }
function serverDownHint() {
  const target = process.env.JWEBGEN_SERVER_TARGET || 'tomcat';
  if (process.platform === 'win32') {
    return target === 'wildfly'
      ? 'Server down: start WildFly (standalone.bat), set WILDFLY_HOME — then [f] refresh.'
      : 'Server down: start Tomcat (startup.bat); set TOMCAT_HOME, TOMCAT10, or CATALINA_HOME — then [f] refresh.';
  }
  if (process.platform === 'darwin') {
    return target === 'wildfly'
      ? 'Server down: start WildFly (bin/standalone.sh) — then [f] refresh.'
      : 'Server down: start Tomcat (catalina.sh or your install) — then [f] refresh.';
  }
  return target === 'wildfly'
    ? 'Server down: start WildFly (prefer standalone.sh; if configured as a service: sudo systemctl start wildfly) — then [f] refresh.'
    : 'Server down: start Tomcat (e.g. sudo systemctl start tomcat10) — then [f] refresh.';
}
let lastStateSig = null;
let uiEnteredAlt = false;
let dashStdinReleased = false;
function syncDashStdinWithDeployPause() {
  if (!pauseFile || !process.stdin.isTTY) return;
  const paused = existsSync(pauseFile);
  if (paused && !dashStdinReleased) {
    try {
      process.stdin.setRawMode(false);
    } catch {}
    try {
      process.stdin.pause();
    } catch {}
    dashStdinReleased = true;
  } else if (!paused && dashStdinReleased) {
    try {
      process.stdin.resume();
    } catch {}
    try {
      process.stdin.setRawMode(true);
    } catch {}
    dashStdinReleased = false;
    setTimeout(() => render({ force: true }), 0);
  }
}
function stateSignature(s) {
  return JSON.stringify({
    phase: s.phase,
    build: s.build,
    deploy: s.deploy,
    server: s.server,
    app: s.app,
    proxyUrl: s.proxyUrl,
    url: s.url,
    appUrl: s.appUrl
  });
}
function render(opts) {
  syncDashStdinWithDeployPause();
  if (pauseFile && existsSync(pauseFile)) return;
  const s = loadState(); if (!s) return;
  const sig = stateSignature(s);
  if (!opts?.force && lastStateSig !== null && sig === lastStateSig) return;
  lastStateSig = sig;
  const LW = 22;
  const SW = 10;
  const stripAnsi = (text) => String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
  const visibleWidth = (text) => stripAnsi(text).length;
  const padAnsi = (text, width) => {
    const raw = String(text || '');
    const pad = Math.max(0, width - visibleWidth(raw));
    return raw + ' '.repeat(pad);
  };
  const phase = s.phase === 'running' ? color('1;34', '● cycle') : color('1;32', '✓ idle');
  const build = s.build?.startsWith('ok') ? color('0;32', s.build) : s.build?.startsWith('error') ? color('0;31', s.build) : color('1;33', s.build);
  const deploy = s.deploy?.startsWith('ok') ? color('0;32', s.deploy) : s.deploy?.startsWith('error') ? color('0;31', s.deploy) : color('1;33', s.deploy);
  const server = s.server === 'up' ? color('0;32', 'up') : s.server === 'down' ? color('0;31', 'down') : color('1;33', s.server);
  const app = s.app === 'up' ? color('0;32', 'up') : s.app === 'down' ? color('0;31', 'down') : color('1;33', s.app ?? 'checking');
  const reloadUrl = color('0;32', s.proxyUrl || s.url || '');
  const directUrl = color('2;37', s.appUrl || '');
  const leftStatus = [build, server];
  const rightStatus = [deploy, app];
  const statusWidth = Math.max(
    SW,
    ...leftStatus.map((v) => visibleWidth(v)),
    ...rightStatus.map((v) => visibleWidth(v))
  );
  const lbl = (k) => color('2;37', String(k).padEnd(LW));
  const kv = (k, v) => lbl(k) + color('2;37', ': ') + padAnsi(v, statusWidth);
  const kvPair = (k1, v1, k2, v2) => '  ' + kv(k1, v1) + '   ' + kv(k2, v2) + '\\n';
  const showStartServer = s.server === 'down';
  const controls = color('2;37', showStartServer ? '[f] refresh  [s] start server' : '[f] refresh');
  const serverHint = s.server === 'down' ? ('\\n  ' + color('2;37', serverDownHint())) : '';
  const out = color('1;36', 'jwebgen --dev') + '  ' + phase + '\\n'
    + kvPair('build', build, 'deploy', deploy)
    + kvPair('server', server, 'app', app)
    + '  ' + kv('browse (LiveReload)', reloadUrl) + '\\n'
    + '  ' + kv('browse (no reload)', directUrl) + '\\n'
    + '  ' + kv('cmd', controls)
    + serverHint;
  let prefix;
  if (process.platform === 'win32') {
    prefix = '\\x1b[H\\x1b[2J';
  } else {
    if (!uiEnteredAlt) {
      uiEnteredAlt = true;
      prefix = '\\x1b[?1l\\x1b[?1049h\\x1b[?25l\\x1b[H\\x1b[2J';
    } else {
      prefix = '\\x1b[?25l\\x1b[H\\x1b[2J';
    }
  }
  process.stderr.write(prefix + out + '\\n');
}
function restoreTerminal() {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
  if (process.platform === 'win32') {
    process.stderr.write('\\x1b[?25h');
  } else {
    process.stderr.write('\\x1b[?1l\\x1b[?25h\\x1b[?1049l');
  }
}
function requestParentExit() {
  restoreTerminal();
  if (parentPid > 1) {
    try {
      process.kill(parentPid, 'SIGINT');
      process.exit(130);
    } catch {
      process.exit(130);
    }
  } else {
    process.exit(130);
  }
}
process.on('SIGINT', () => requestParentExit());
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'utf8');
    if (b.length && (b[0] === 3 || b[0] === 4)) {
      requestParentExit();
      return;
    }
    const ch = b.length ? String.fromCharCode(b[0]).toLowerCase() : '';
    if (ch === 'f') {
      if (commandFile) {
        try {
          writeFileSync(commandFile, JSON.stringify({ cmd: 'refresh', ts: Date.now() }), 'utf8');
        } catch {}
      }
      render({ force: true });
      return;
    }
    if (ch === 's' && commandFile) {
      const cur = loadState();
      if (cur && cur.server === 'down') {
        try {
          writeFileSync(commandFile, JSON.stringify({ cmd: 'start_server', ts: Date.now() }), 'utf8');
        } catch {}
      }
      render({ force: true });
    }
  });
}
process.on('exit', () => {
  if (process.platform === 'win32') process.stderr.write('\\x1b[?25h');
  else process.stderr.write('\\x1b[?1l\\x1b[?25h\\x1b[?1049l');
});
if (parentPid > 1) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 1500).unref();
}
const tickMs = process.platform === 'win32' ? 750 : 500;
setInterval(() => syncDashStdinWithDeployPause(), 50);
setInterval(() => render(), tickMs);
render({ force: true });
`;
