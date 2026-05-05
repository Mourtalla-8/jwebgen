export const DEV_WORKER_SCRIPT_TEMPLATE = `import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { readdirSync, statSync, watch as fsWatch, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stateFile = process.argv[2];
const eventsFile = process.argv[3];
const pauseFile = process.argv[4];
const parentPid = Number(process.argv[5] || 0);
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
function syncPublicUrls() {
  state.proxyUrl = 'http://localhost:' + proxyPort + '/' + appName + '/';
  state.appUrl = 'http://localhost:' + httpPort + '/' + appName + '/';
  state.url = state.proxyUrl;
}
function saveState() { writeFileSync(stateFile, JSON.stringify(state), 'utf8'); }
function emit(type, details = {}) { appendFileSync(eventsFile, JSON.stringify({ type, ts: Date.now(), ...details }) + '\\n', 'utf8'); }
function parseListenOwner(text, port) {
  const lines = String(text || '').split('\\n');
  for (const line of lines) {
    if (!line.includes('LISTEN')) continue;
    if (line.includes(':' + String(port))) return line.trim();
  }
  return '';
}
function portOwner(port) {
  return new Promise((resolve) => {
    const ss = spawn('ss', ['-lntp'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ss.stdout.on('data', (c) => { out += String(c); });
    ss.on('error', () => resolve(null));
    ss.on('exit', (code) => {
      if (code === 0) {
        const owner = parseListenOwner(out, port);
        if (owner) return resolve(owner);
      }
      const lsof = spawn('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let lsofOut = '';
      lsof.stdout.on('data', (c) => { lsofOut += String(c); });
      lsof.on('error', () => resolve(null));
      lsof.on('exit', () => {
        const line = String(lsofOut || '').split('\\n')[1];
        resolve(line ? line.trim() : null);
      });
    });
  });
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
      process.exit(0);
    }
  }, 1500).unref();
}

let running = false;
let queued = false;
let timer = null;
let lastBuildQueuedAt = 0;
let lastDeployFinishedAt = 0;
const DOUBLE_RELOAD = process.env.JWEBGEN_DOUBLE_RELOAD === '1';
async function rebuild() {
  if (running) { queued = true; return; }
  running = true;
  state.phase = 'running'; state.build = 'running'; state.deploy = 'pending'; saveState();
  try {
    await runScript('build.sh');
    state.build = 'ok'; state.deploy = 'running'; saveState();
    await runScript('deploy.sh');
    state.deploy = 'ok'; state.phase = 'idle'; saveState();
    notifyReload();
    if (DOUBLE_RELOAD) setTimeout(() => notifyReload(), 600);
    lastDeployFinishedAt = Date.now();
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

function runScript(script) {
  return new Promise((resolve, reject) => {
    const scriptsDir = path.join(root, '.jwebgen', 'scripts');
    const mjsName = script.replace(/\\.sh$/, '.mjs');
    const mjsPath = path.join(scriptsDir, mjsName);
    const shPath = path.join(scriptsDir, script);
    const useNode = existsSync(mjsPath);
    const p = useNode
      ? spawn(process.execPath, [mjsPath], { cwd: root, stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'], shell: false })
      : spawn(shPath, [], { cwd: root, stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'], shell: false });
    let logs = '';
    if (!verbose) {
      p.stdout?.on('data', (c) => { logs += String(c); if (logs.length > 20000) logs = logs.slice(-20000); });
      p.stderr?.on('data', (c) => { logs += String(c); if (logs.length > 20000) logs = logs.slice(-20000); });
    }
    p.on('error', (err) => reject(err));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error((logs || script + ' failed').trim()))));
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
      if (running || Date.now() - lastDeployFinishedAt < 2200) {
        return resolve({ ok: true, status: 'app_down' });
      }
      if (serverTarget === 'wildfly') {
        const mgmtReq = http.request('http://127.0.0.1:9990/', { method: 'GET', timeout: 1500, headers: { 'accept-encoding': 'identity' } }, (mgmtRes) => {
          mgmtRes.resume();
          if (Number(mgmtRes.statusCode || 0) > 0) return resolve({ ok: true, status: 'app_down_000', httpStatus: 0 });
          checkPortOwner();
        });
        mgmtReq.on('error', () => checkPortOwner());
        mgmtReq.on('timeout', () => { mgmtReq.destroy(); checkPortOwner(); });
        mgmtReq.end();
        return;
      }
      if (process.platform !== 'linux') {
        checkPortOwner();
        return;
      }
      const p = spawn('systemctl', ['is-active', '--quiet', serverUnit], { stdio: 'ignore' });
      p.on('error', () => checkPortOwner());
      p.on('exit', (code) => {
        if (code === 0) return resolve({ ok: true, status: 'app_down' });
        checkPortOwner();
      });
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
  return 'unknown';
}
let lastStatus = '';
setInterval(async () => {
  const check = await serverUp();
  const nextServer = check.ok ? 'up' : 'down';
  const nextApp = nextAppState(check.status);
  let changed = false;
  if (state.server !== nextServer) { state.server = nextServer; changed = true; }
  if (state.app !== nextApp) { state.app = nextApp; changed = true; }
  if (changed) saveState();
  if (check.status !== lastStatus) {
    lastStatus = check.status;
    if (check.status === 'port_conflict') emit('http_port_conflict', { port: httpPort, owner: check.owner || '' });
    else if (check.status === 'down') emit('server_down', { reason: check.status, port: httpPort });
    else if (check.status === 'app_down' || check.status === 'app_down_000') {
      emit('app_unreachable', { port: httpPort, app: appName, httpStatus: check.httpStatus || 0 });
    }
  }
}, 1200).unref();
walkAndWatch(root);
// Keep watcher coverage up to date when new directories appear.
setInterval(() => {
  walkAndWatch(root);
}, 9000).unref();
saveState();
rebuild();
`;

export const DEV_DASHBOARD_SCRIPT_TEMPLATE = `import { existsSync, readFileSync } from 'node:fs';

const stateFile = process.argv[2];
const pauseFile = process.argv[3];
const parentPid = Number(process.argv[4] || 0);
const isTTY = process.stderr.isTTY;
if (!isTTY) process.exit(0);
function color(code, text) { return '\\x1b[' + code + 'm' + text + '\\x1b[0m'; }
function loadState() { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } }
function serverDownHint() {
  const target = process.env.JWEBGEN_SERVER_TARGET || 'tomcat';
  if (process.platform === 'win32') {
    return target === 'wildfly'
      ? 'Server down: start WildFly (standalone.bat), set WILDFLY_HOME — then [f] refresh.'
      : 'Server down: start Tomcat (startup.bat), set TOMCAT_HOME; Maven on PATH — then [f] refresh.';
  }
  if (process.platform === 'darwin') {
    return target === 'wildfly'
      ? 'Server down: start WildFly (bin/standalone.sh) — then [f] refresh.'
      : 'Server down: start Tomcat (catalina.sh or your install) — then [f] refresh.';
  }
  return target === 'wildfly'
    ? 'Server down: start WildFly (systemctl or standalone.sh) — then [f] refresh.'
    : 'Server down: start Tomcat (e.g. systemctl start tomcat10) — then [f] refresh.';
}
function render() {
  if (pauseFile && existsSync(pauseFile)) return;
  const s = loadState(); if (!s) return;
  const LW = 22;
  const phase = s.phase === 'running' ? color('1;34', '● cycle') : color('1;32', '✓ idle');
  const build = s.build?.startsWith('ok') ? color('0;32', s.build) : s.build?.startsWith('error') ? color('0;31', s.build) : color('1;33', s.build);
  const deploy = s.deploy?.startsWith('ok') ? color('0;32', s.deploy) : s.deploy?.startsWith('error') ? color('0;31', s.deploy) : color('1;33', s.deploy);
  const server = s.server === 'up' ? color('0;32', 'up') : s.server === 'down' ? color('0;31', 'down') : color('1;33', s.server);
  const app = s.app === 'up' ? color('0;32', 'up') : s.app === 'down' ? color('0;31', 'down') : color('1;33', s.app ?? 'checking');
  const reloadUrl = color('0;32', s.proxyUrl || s.url || '');
  const directUrl = color('2;37', s.appUrl || '');
  const lbl = (k) => color('2;37', String(k).padEnd(LW));
  const kv = (k, v) => lbl(k) + color('2;37', ': ') + v;
  const kvPair = (k1, v1, k2, v2) => '  ' + kv(k1, v1) + '   ' + kv(k2, v2) + '\\n';
  const controls = color('2;37', '[f] refresh');
  const serverHint = s.server === 'down' ? ('\\n  ' + color('2;37', serverDownHint())) : '';
  const out = color('1;36', 'jwebgen --dev') + '  ' + phase + '\\n'
    + kvPair('build', build, 'deploy', deploy)
    + kvPair('server', server, 'app', app)
    + '  ' + kv('browse (LiveReload)', reloadUrl) + '\\n'
    + '  ' + kv('browse (no reload)', directUrl) + '\\n'
    + '  ' + kv('cmd', controls)
    + serverHint;
  process.stderr.write('\\x1b[?1l\\x1b[?1049h\\x1b[?25l\\x1b[H\\x1b[2J' + out + '\\n');
}
process.on('exit', () => { process.stderr.write('\\x1b[?1l\\x1b[?25h\\x1b[?1049l'); });
if (parentPid > 1) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 1500).unref();
}
setInterval(render, 500);
render();
`;
