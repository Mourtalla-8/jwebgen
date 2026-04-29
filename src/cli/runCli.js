import { runCli as runCliImpl } from './runCli.impl.js';

export async function runCli() {
  return await runCliImpl();
}

export function isHandledError(error) {
  return Boolean(error?.jwebgenHandled);
}

