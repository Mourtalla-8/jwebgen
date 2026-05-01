import {
  DEV_DASHBOARD_SCRIPT_TEMPLATE,
  DEV_WORKER_SCRIPT_TEMPLATE
} from './watchEmbeddedTemplates.js';
import { WATCH_RUNTIME_SECTION } from './watchRuntimeSection.js';

export function makeDevScript({ serverTarget }) {
  const exportTargetLine =
    serverTarget === 'tomcat' || serverTarget === 'wildfly'
      ? `export JWEBGEN_SERVER_TARGET="\${JWEBGEN_SERVER_TARGET:-${serverTarget}}"`
      : `export JWEBGEN_SERVER_TARGET="\${JWEBGEN_SERVER_TARGET:-}"`;
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

export JWEBGEN_DEV=1
export JWEBGEN_VERBOSE="\${JWEBGEN_VERBOSE:-0}"
${exportTargetLine}
exec "$SCRIPT_DIR/watch.sh"
`;
}

export function makeWatchScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_NAME="$(basename "$ROOT_DIR")"
SERVER_TARGET="\${JWEBGEN_SERVER_TARGET:-tomcat}"
JWEBGEN_VERBOSE="\${JWEBGEN_VERBOSE:-0}"
LIVE_PORT="\${JWEBGEN_LIVE_PORT:-35729}"
DEV_HTTP_PORT="\${JWEBGEN_HTTP_PORT:-8080}"
STATE_FILE="$ROOT_DIR/.jwebgen/.jwebgen-dev-state.json"
EVENTS_FILE="$ROOT_DIR/.jwebgen/.jwebgen-dev-events.jsonl"
UI_PAUSE_FILE="$ROOT_DIR/.jwebgen/.jwebgen-ui-pause"
WORKER_SCRIPT="$ROOT_DIR/.jwebgen/.jwebgen-worker.mjs"
DASHBOARD_SCRIPT="$ROOT_DIR/.jwebgen/.jwebgen-dashboard.mjs"
DEV_PID_FILE="$ROOT_DIR/.jwebgen/.jwebgen-dev.pid"
WORKER_PID=""
DASHBOARD_PID=""
CLEANUP_DONE=0
STOP_MSG_DONE=0

ui_info() { echo "ℹ $1" >&2; }
ui_warn() { echo "⚠ $1" >&2; }
ui_err() { echo "✗ $1" >&2; }
restore_tty_ui() {
  if [[ -t "$TTY_OUT_FD" ]]; then
    # Ensure we leave alt-screen and restore cursor before prompts/logs.
    printf '\\033[?1l\\033[?25h\\033[?1049l\\033[0m' >&$TTY_OUT_FD || true
  fi
}
pause_ui() {
  : > "$UI_PAUSE_FILE"
  restore_tty_ui
}
resume_ui() { rm -f "$UI_PAUSE_FILE" 2>/dev/null || true; }
cleanup_orphan_dev_session() {
  if [[ -f "$DEV_PID_FILE" ]]; then
    local old_pid=""
    old_pid="$(tr -d '[:space:]' < "$DEV_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" && "$old_pid" != "$$" ]] && kill -0 "$old_pid" 2>/dev/null; then
      ui_warn "Previous dev session detected (PID $old_pid), stopping..."
      kill "$old_pid" 2>/dev/null || true
      sleep 1
      kill -9 "$old_pid" 2>/dev/null || true
    fi
  fi
  printf '%s' "$$" > "$DEV_PID_FILE" 2>/dev/null || true
}

# TTY handling: dev mode should work even without /dev/tty (CI, some IDE terminals).
TTY_IN_FD=0
TTY_OUT_FD=2
# Prefer a real TTY only if it can be opened.
if { exec 3<>/dev/tty; } 2>/dev/null; then
  TTY_IN_FD=3
  TTY_OUT_FD=3
fi

${WATCH_RUNTIME_SECTION}

cat > "$WORKER_SCRIPT" <<'EOF'
${DEV_WORKER_SCRIPT_TEMPLATE}
EOF

cat > "$DASHBOARD_SCRIPT" <<'EOF'
${DEV_DASHBOARD_SCRIPT_TEMPLATE}
EOF

chmod +x "$WORKER_SCRIPT" "$DASHBOARD_SCRIPT" 2>/dev/null || true

cleanup_orphan_dev_session

if ! server_is_running; then
  detect_server_state
  ui_warn "$(server_label) unavailable at startup."
  show_server_help
  if ! prompt_server_remediation; then
    ui_info "stopping dev mode"
    exit 0
  fi
fi

start_worker
start_dashboard
handle_events_loop || true
wait "$WORKER_PID" 2>/dev/null || true
`;
}
