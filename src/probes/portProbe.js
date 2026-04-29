export function parseListenOwner(text, port) {
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    if (!line.includes('LISTEN')) continue;
    if (line.includes(':' + String(port))) return line.trim();
  }
  return '';
}

