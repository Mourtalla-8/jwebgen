export const DEV_WORKER_SCRIPT_TEMPLATE = `import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdirSync, statSync, watch as fsWatch, writeFileSync, appendFileSync } from 'node:fs';
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
const wsClients = new Set();

const state = {
  phase: 'idle',
  build: 'pending',
  deploy: 'pending',
  server: 'checking',
  app: 'checking',
  live: 'starting',
  url: 'http://localhost:' + httpPort + '/' + appName + '/',
  serverCheckUrl: serverTarget === 'wildfly' ? 'http://127.0.0.1:9990' : 'http://127.0.0.1:' + httpPort,
  livePort
};
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
    const cmd = "node -e \\"const net=require('node:net');let p=" + startAt + ";const max=p+50;(function t(){if(p>max){process.exit(1);}const s=net.createServer();s.once('error',()=>{p++;t();});s.once('listening',()=>{s.close(()=>{console.log(p);process.exit(0);});});s.listen(p,'127.0.0.1');})();\\"";
    const p = spawn('bash', ['-lc', cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (c) => { out += String(c); });
    p.on('exit', (code) => resolve(code === 0 ? Number(out.trim()) : null));
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
function notifyReload() {
  const msg = JSON.stringify({ command: 'reload' });
  for (const s of wsClients) { try { wsSend(s, msg); } catch {} }
}
const wsServer = http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('jwebgen live\\n');
});
wsServer.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    (async () => {
      const busyPort = livePort;
      const owner = await portOwner(busyPort);
      const fallback = await findFreePort(busyPort + 1);
      state.live = 'port busy (' + busyPort + ')';
      saveState();
      emit('live_port_busy', { port: busyPort, owner: owner || '' });
      if (fallback) {
        livePort = fallback;
        state.livePort = livePort;
        wsServer.listen(livePort, () => {
          state.live = 'ready (ws://localhost:' + livePort + ')';
          saveState();
          emit('live_port_fallback', { fromPort: busyPort, toPort: livePort });
        });
      }
    })().catch(() => {});
    return;
  }
  state.live = 'error';
  saveState();
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
wsServer.listen(livePort, () => {
  state.livePort = livePort;
  state.live = 'ready (ws://localhost:' + livePort + ')';
  saveState();
});
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
  const now = Date.now();
  // Protect against very bursty editor writes (tmp swap, multi-write saves).
  if (now - lastBuildQueuedAt < 120) return;
  lastBuildQueuedAt = now;
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(), 250);
}
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
const watched = new Map();
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
  const ext = path.extname(name).toLowerCase();
  if (RELOAD_RELEVANT_EXT.has(ext)) return true;
  if (name === 'pom.xml') return true;
  if (name === 'web.xml' || name === 'context.xml') return true;
  return false;
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
    const p = spawn('./.jwebgen/scripts/' + script, [], { cwd: root, stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'], shell: false });
    let logs = '';
    if (!verbose) {
      p.stdout?.on('data', (c) => { logs += String(c); if (logs.length > 20000) logs = logs.slice(-20000); });
      p.stderr?.on('data', (c) => { logs += String(c); if (logs.length > 20000) logs = logs.slice(-20000); });
    }
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error((logs || script + ' failed').trim())));
  });
}
function serverUp() {
  return new Promise((resolve) => {
    const appUrl = new URL('/' + appName + '/', 'http://127.0.0.1:' + httpPort).toString();
    const req = http.request(appUrl, { method: 'GET', timeout: 1500 }, (res) => {
      const code = Number(res.statusCode || 0);
      res.resume();
      if (code >= 200 && code < 400) return resolve({ ok: true, status: 'up' });
      checkEngine();
    });
    req.on('error', () => checkEngine());
    req.on('timeout', () => { req.destroy(); checkEngine(); });
    req.end();

    function checkEngine() {
      const cmd = serverTarget === 'tomcat'
        ? 'systemctl is-active --quiet ' + serverUnit + ' 2>/dev/null'
        : 'curl -sS --max-time 2 http://127.0.0.1:9990/ >/dev/null 2>&1';
      const p = spawn('bash', ['-lc', cmd], { stdio: 'ignore' });
      p.on('exit', async (code) => {
        if (code === 0) {
          if (serverTarget === 'wildfly') return resolve({ ok: true, status: 'app_down_000', httpStatus: 0 });
          return resolve({ ok: true, status: 'app_down' });
        }
        const owner = await portOwner(httpPort);
        if (owner) return resolve({ ok: false, status: 'port_conflict', owner });
        resolve({ ok: false, status: 'down' });
      });
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
walkAndWatch(path.join(root, 'src'));
walkAndWatch(root);
// Keep watcher coverage up to date when new directories appear.
setInterval(() => {
  walkAndWatch(path.join(root, 'src'));
  walkAndWatch(root);
}, 3000).unref();
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
function render() {
  if (pauseFile && existsSync(pauseFile)) return;
  const s = loadState(); if (!s) return;
  const phase = s.phase === 'running' ? color('1;34', '● cycle') : color('1;32', '✓ idle');
  const build = s.build?.startsWith('ok') ? color('0;32', s.build) : s.build?.startsWith('error') ? color('0;31', s.build) : color('1;33', s.build);
  const deploy = s.deploy?.startsWith('ok') ? color('0;32', s.deploy) : s.deploy?.startsWith('error') ? color('0;31', s.deploy) : color('1;33', s.deploy);
  const server = s.server === 'up' ? color('0;32', 'up') : s.server === 'down' ? color('0;31', 'down') : color('1;33', s.server);
  const app = s.app === 'up' ? color('0;32', 'up') : s.app === 'down' ? color('0;31', 'down') : color('1;33', s.app ?? 'checking');
  const live = s.live?.startsWith('ready') ? color('0;34', s.live) : color('0;31', s.live ?? 'error');
  const url = color('0;32', s.url ?? '');
  const probe = color('2;37', s.serverCheckUrl ?? '');
  const label = (k) => color('2;37', String(k).padEnd(8, ' '));
  const kv = (k, v) => label(k) + ': ' + v;
  const controls = color('2;37', '[f] refresh');
  const out = color('1;36', 'jwebgen --dev') + '  ' + phase + '\\n'
    + '  ' + kv('build', build) + '   ' + kv('deploy', deploy) + '\\n'
    + '  ' + kv('server', server) + '   ' + kv('app', app) + '   ' + kv('live', live) + '\\n'
    + '  ' + kv('url', url) + '\\n'
    + '  ' + kv('probe', probe) + '\\n'
    + '  ' + kv('cmd', controls);
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
