export function computeDevState({ engineUp, appReachable, portConflict, liveReady }) {
  const server = engineUp ? 'up' : 'down';
  const app = appReachable ? 'up' : engineUp ? 'down' : 'unknown';
  const live = liveReady ? 'ready' : 'starting';
  return { server, app, portConflict: Boolean(portConflict), live };
}

