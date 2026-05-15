/**
 * Windows: subprocesses often exit with STATUS_CONTROL_C_EXIT (0xC000013A) instead of
 * exit code 130 when Ctrl+C stops the console. Normalize so CLI UX matches Unix.
 */
const WINDOWS_STATUS_CONTROL_C_EXIT_U = 3221225786;

/** @param {unknown} error execa error or similar */
export function isUserInterruptExecaError(error) {
  if (!error || typeof error !== 'object') return false;
  const e = /** @type {{ signal?: string; exitCode?: number }} */ (error);
  if (e.signal === 'SIGINT') return true;
  const c = e.exitCode;
  if (c === 130 || c === 143) return true;
  if (c === 1 && e.signal === 'SIGINT') return true;
  if (typeof c === 'number' && (c >>> 0) === WINDOWS_STATUS_CONTROL_C_EXIT_U) return true;
  return false;
}

/** @param {unknown} error */
export function cliExitCodeForInterrupt(error) {
  const e = /** @type {{ signal?: string; exitCode?: number }} */ (error || {});
  if (e.exitCode === 143 || e.signal === 'SIGTERM') return 143;
  return 130;
}
