export async function runCli() {
  throw new Error('src/cli/runCli is deprecated. Use bin/jwebgen.js as the runtime entrypoint.');
}

export function isHandledError(error) {
  return !!error?.jwebgenHandled;
}

