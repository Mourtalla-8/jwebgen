import { WINDOWS_WILDFLY_PORTABLE_VERSION } from '../project/windowsSetupInstall.js';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

export function makeDeployTomcatScript({ appName }) {
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s 2>/dev/null || echo unknown)" != "Linux" ]]; then
  echo "Non-Linux environment detected. This script primarily targets Linux/systemd."
  echo "Continue only if local Tomcat is configured manually."
fi

# Colors for logs
RED='\\\\033[0;31m'
GREEN='\\\\033[0;32m'
YELLOW='\\\\033[1;33m'
BLUE='\\\\033[0;34m'
NC='\\\\033[0m' # No Color

log_info() {
  echo -e "\${BLUE}ℹ\${NC} $1"
}

log_success() {
  echo -e "\${GREEN}✓\${NC} $1"
}

log_warn() {
  echo -e "\${YELLOW}⚠\${NC} $1"
}

log_error() {
  echo -e "\${RED}✗\${NC} $1"
}

log_action() {
  echo -e "\${BLUE}→\${NC} $1"
}

run_privileged() {
  if "$@" 2>/dev/null; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    return 1
  fi
  sudo -n "$@"
}

APP_NAME=${shellQuote(appName)}
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOMCAT_DIR="\${TOMCAT_HOME:-\${TOMCAT10:-\${CATALINA_HOME:-}}}"
if [[ -z "$TOMCAT_DIR" ]]; then
  for d in /var/lib/tomcat10 /var/lib/tomcat; do
    if [[ -d "$d" ]]; then TOMCAT_DIR="$d"; break; fi
  done
fi
TOMCAT_DIR="\${TOMCAT_DIR:-/var/lib/tomcat10}"
if [[ -z "$TOMCAT_DIR" || "$TOMCAT_DIR" = "/" ]]; then
  log_error "Tomcat home is not configured. Set TOMCAT_HOME, TOMCAT10, or CATALINA_HOME."
  exit 1
fi
if [[ ! -d "$TOMCAT_DIR" ]]; then
  log_error "Tomcat home path was not found: $TOMCAT_DIR"
  exit 1
fi
if [[ ! -d "$TOMCAT_DIR/webapps" ]]; then
  log_error "Tomcat webapps directory was not found under: $TOMCAT_DIR"
  exit 1
fi
CLEANUP_DEV_MODE=0
if [[ "\${1:-}" = "--cleanup-dev" ]]; then
  CLEANUP_DEV_MODE=1
fi

tomcat_unit_name() {
  local c
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "tomcat10"
    return 0
  fi
  for c in tomcat10 tomcat; do
    systemctl status "$c" >/dev/null 2>&1
    case "$?" in
      0|3) echo "$c"; return 0 ;;
    esac
  done
  echo "tomcat10"
}

# Servlet / @WebServlet class changes need a reloadable Context; JSP can update without it.
ensure_tomcat_dev_reloadable_context() {
  local ctx="$DEST_DIR/META-INF/context.xml"
  if ! run_privileged mkdir -p "$DEST_DIR/META-INF"; then
    log_error "Unable to create $DEST_DIR/META-INF."
    echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
    exit 1
  fi
  if [[ ! -f "$ctx" ]]; then
    if ! printf '%s\\n' '<?xml version="1.0" encoding="UTF-8"?>' '<Context reloadable="true" />' | run_privileged tee "$ctx" >/dev/null; then
      log_error "Unable to write default META-INF/context.xml for Tomcat dev reload."
      log_info "Run 'sudo -v' then retry."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
    return 0
  fi
  if grep -qE 'reloadable[[:space:]]*=[[:space:]]*("true"|'"'"'true'"'"')' "$ctx" 2>/dev/null; then
    return 0
  fi
  if grep -q '<Context' "$ctx" 2>/dev/null; then
    # Replace existing reloadable="..." or reloadable='...' (flexible whitespace), else insert on <Context.
    if grep -qE 'reloadable[[:space:]]*=' "$ctx" 2>/dev/null; then
      if ! run_privileged sed -i -E 's/reloadable[[:space:]]*=[[:space:]]*"[^"]*"/reloadable="true"/g' "$ctx" 2>/dev/null; then
        log_warn "Could not update reloadable attribute in META-INF/context.xml; servlet class updates may need a Tomcat restart."
      fi
      if ! run_privileged sed -i -E 's/reloadable[[:space:]]*=[[:space:]]*'"'"'[^'"'"']*'"'"'/reloadable="true"/g' "$ctx" 2>/dev/null; then
        log_warn "Could not update reloadable attribute in META-INF/context.xml; servlet class updates may need a Tomcat restart."
      fi
    else
      if ! run_privileged sed -i '/<Context/s/<Context/<Context reloadable="true"/' "$ctx" 2>/dev/null; then
        log_warn "Could not add reloadable=true to META-INF/context.xml; servlet class updates may need a Tomcat restart."
      fi
    fi
  fi
}

EXPLODED_APP_DIR="$ROOT_DIR/target/$APP_NAME"

if [[ "$CLEANUP_DEV_MODE" = "0" && "\${JWEBGEN_DEV:-0}" = "1" ]]; then
  if [[ ! -d "$EXPLODED_APP_DIR" ]]; then
    log_error "Build is required"
    exit 1
  fi
fi

# Find WAR only after we know the directory exists
WAR_FILE=""
if [[ -d "$ROOT_DIR/target" ]]; then
  WAR_FILE="$(find "$ROOT_DIR/target" -maxdepth 1 -name '*.war' 2>/dev/null | sort | tail -n 1)" || true
fi

if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  log_action "Tomcat dev cleanup (current app)"
else
  log_action "Deploying to Tomcat"
fi

if [[ "$CLEANUP_DEV_MODE" = "0" ]]; then
  # Check whether Tomcat is running
  TOMCAT_UNIT="$(tomcat_unit_name)"
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$TOMCAT_UNIT" 2>/dev/null; then
    log_success "Tomcat is running"
  elif command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:8080/ >/dev/null 2>&1; then
    log_success "Tomcat is running (HTTP responds)"
  else
    log_error "Tomcat is not running"
    log_info "Start it: sudo systemctl start $TOMCAT_UNIT"
    echo "__JWEBGEN_EVENT__ server_down" >&2
    exit 1
  fi
fi

if ! run_privileged mkdir -p "$TOMCAT_DIR/webapps"; then
  log_error "Insufficient permissions to create $TOMCAT_DIR/webapps."
  log_info "Run 'sudo -v' then retry."
  echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
  exit 1
fi

if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  if ! run_privileged rm -rf "$TOMCAT_DIR/webapps/$APP_NAME" "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
    sleep 0.3
  fi
  if [[ -e "$TOMCAT_DIR/webapps/$APP_NAME" || -e "$TOMCAT_DIR/webapps/$APP_NAME.war" ]]; then
    if ! run_privileged rm -rf "$TOMCAT_DIR/webapps/$APP_NAME" "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
      log_error "Insufficient permissions to clean $APP_NAME in $TOMCAT_DIR/webapps."
      log_info "Run 'sudo -v' then retry."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
  fi
  if [[ -e "$TOMCAT_DIR/webapps/$APP_NAME" || -e "$TOMCAT_DIR/webapps/$APP_NAME.war" ]]; then
    log_error "Insufficient permissions to clean $APP_NAME in $TOMCAT_DIR/webapps."
    log_info "Run 'sudo -v' then retry."
    echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
    exit 1
  fi
  log_success "Dev cleanup completed for $APP_NAME (Tomcat)."
  exit 0
fi

if [[ "\${JWEBGEN_DEV:-0}" = "1" ]]; then
  DEST_DIR="$TOMCAT_DIR/webapps/$APP_NAME"
  # Incremental sync (fast) instead of delete + full copy.
  if command -v rsync >/dev/null 2>&1; then
    if ! run_privileged rsync -a --delete "$EXPLODED_APP_DIR/" "$DEST_DIR/"; then
      log_warn "Retrying with sudo"
      if ! sudo -n mkdir -p "$DEST_DIR" || ! sudo -n rsync -a --delete "$EXPLODED_APP_DIR/" "$DEST_DIR/"; then
        log_error "Insufficient permissions. Run 'sudo -v' then retry."
        echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
        exit 1
      fi
    fi
  else
    # Simple fallback (less optimal) when rsync is unavailable.
    run_privileged rm -rf "$DEST_DIR" || true
    if ! run_privileged cp -R "$EXPLODED_APP_DIR" "$DEST_DIR"; then
      log_warn "Retrying with sudo"
      if ! sudo -n rm -rf "$DEST_DIR" 2>/dev/null || true; then true; fi
      if ! sudo -n cp -R "$EXPLODED_APP_DIR" "$DEST_DIR"; then
        log_error "Insufficient permissions. Run 'sudo -v' then retry."
        echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
        exit 1
      fi
    fi
  fi

  if ! run_privileged rm -f "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
    log_error "Insufficient permissions to remove stale WAR in $TOMCAT_DIR/webapps."
    log_info "Run 'sudo -v' then retry."
    echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
    exit 1
  fi
  rm -f "$ROOT_DIR/target/$APP_NAME.war" 2>/dev/null || true

  ensure_tomcat_dev_reloadable_context
  
  # Tomcat reload hints (exploded deploy): always bump a standard descriptor when present.
  if [[ -f "$DEST_DIR/WEB-INF/web.xml" ]]; then
    if ! run_privileged touch "$DEST_DIR/WEB-INF/web.xml"; then
      log_error "Unable to refresh Tomcat deployment descriptor (WEB-INF/web.xml)."
      log_info "Run 'sudo -v' then retry."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
  elif [[ -d "$DEST_DIR/WEB-INF/classes" ]]; then
    if ! run_privileged touch "$DEST_DIR/WEB-INF/classes"; then
      log_error "Unable to refresh Tomcat WEB-INF/classes timestamp."
      log_info "Run 'sudo -v' then retry."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
  else
    log_warn "No WEB-INF/web.xml or WEB-INF/classes under deployed app; Tomcat may not reload until you add one or restart the server."
  fi
  if [[ -f "$DEST_DIR/META-INF/context.xml" ]]; then
    if ! run_privileged touch "$DEST_DIR/META-INF/context.xml"; then
      log_error "Unable to refresh Tomcat context metadata."
      log_info "Run 'sudo -v' then retry."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
  fi
else
  run_privileged rm -rf "$TOMCAT_DIR/webapps/$APP_NAME" "$TOMCAT_DIR/webapps/$APP_NAME.war" || true
  if [[ -z "$WAR_FILE" || ! -f "$WAR_FILE" ]]; then
    log_error "WAR file not found"
    exit 1
  fi
  if ! run_privileged cp "$WAR_FILE" "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
    log_warn "Retrying with sudo"
    if ! sudo -n cp "$WAR_FILE" "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
      log_error "Insufficient permissions. Run 'sudo -v' then retry."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
  fi
fi

log_success "http://localhost:8080/$APP_NAME"
`;
}

export function makeDeployServerScript({ appName, serverTarget }) {
  if (serverTarget === 'tomcat') {
    return makeDeployTomcatScript({ appName });
  }

  if (serverTarget === 'wildfly') {
    return `#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s 2>/dev/null || echo unknown)" != "Linux" ]]; then
  echo "Non-Linux environment detected. This script primarily targets Linux/systemd."
  echo "Continue only if local WildFly is configured manually."
fi

APP_NAME=${shellQuote(appName)}
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_HTTP_PORT="\${JWEBGEN_HTTP_PORT:-8080}"

WAR_FILE=""
if [[ -d "$ROOT_DIR/target" ]]; then
  WAR_FILE="$(find "$ROOT_DIR/target" -maxdepth 1 -name '*.war' 2>/dev/null | sort | tail -n 1)" || true
fi

WILDFLY_HOME_INPUT="\${WILDFLY_HOME:-}"
DEPLOY_DIR_INPUT="\${WILDFLY_DEPLOYMENTS:-}"
JWEBGEN_WF_OPT_VER='${WINDOWS_WILDFLY_PORTABLE_VERSION}'
wildfly_discover_home_linux() {
  if [[ -f "/opt/wildfly/jboss-modules.jar" ]]; then
    printf '%s' "/opt/wildfly"
    return
  fi
  if [[ -n "\${HOME:-}" ]]; then
    local pref="\${HOME}/opt/wildfly-\${JWEBGEN_WF_OPT_VER}"
    if [[ -f "\$pref/jboss-modules.jar" ]]; then
      printf '%s' "\$pref"
      return
    fi
    local best="" d name
    shopt -s nullglob
    for d in "\${HOME}/opt"/wildfly-*; do
      [[ -d "\$d" && -f "\$d/jboss-modules.jar" ]] || continue
      name="\$(basename "\$d")"
      if [[ -z "\$best" || "\$name" > "\$(basename "\$best")" ]]; then
        best="\$d"
      fi
    done
    shopt -u nullglob
    if [[ -n "\$best" ]]; then
      printf '%s' "\$best"
      return
    fi
  fi
  printf '%s' "/opt/wildfly"
}
WILDFLY_HOME="$WILDFLY_HOME_INPUT"
if [[ -z "$WILDFLY_HOME" && -z "$DEPLOY_DIR_INPUT" ]]; then
  WILDFLY_HOME="\$(wildfly_discover_home_linux)"
fi
DEPLOY_DIR="$DEPLOY_DIR_INPUT"
if [[ -z "$DEPLOY_DIR" ]]; then
  DEPLOY_DIR="$WILDFLY_HOME/standalone/deployments"
fi
if [[ -z "$DEPLOY_DIR" || "$DEPLOY_DIR" = "/" ]]; then
  echo "WildFly deployments path is not configured. Set WILDFLY_DEPLOYMENTS (or WILDFLY_HOME)."
  exit 1
fi
if [[ -z "$DEPLOY_DIR_INPUT" && -n "$WILDFLY_HOME" && ! -d "$WILDFLY_HOME" ]]; then
  echo "WildFly home path was not found: $WILDFLY_HOME"
  exit 1
fi
if [[ ! -d "$DEPLOY_DIR" ]]; then
  echo "WildFly deployments directory was not found: $DEPLOY_DIR"
  exit 1
fi
CLEANUP_DEV_MODE=0
if [[ "\${1:-}" = "--cleanup-dev" ]]; then
  CLEANUP_DEV_MODE=1
fi

run_privileged() {
  if "$@" 2>/dev/null; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    return 1
  fi
  sudo -n "$@"
}

wildfly_cleanup_artifacts_remain() {
  [[ -e "$DEPLOY_DIR/$APP_NAME.war" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.deployed" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.failed" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.undeployed" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.skipdeploy" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.pending" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.isdeploying" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.isundeploying" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.status" ]] || \\
  [[ -e "$DEPLOY_DIR/$APP_NAME.war.dodeploy" ]]
}

if [[ "$CLEANUP_DEV_MODE" = "0" && ( -z "$WAR_FILE" || ! -f "$WAR_FILE" ) ]]; then
  echo "No WAR file found. Run ./.jwebgen/scripts/build.sh first"
  echo "__JWEBGEN_EVENT__ deploy_error" >&2
  exit 1
fi

if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  echo "WildFly dev cleanup (current app): $DEPLOY_DIR/$APP_NAME.war"
else
  echo "Deploying WildFly to: $DEPLOY_DIR/$APP_NAME.war"
fi

if [[ "$CLEANUP_DEV_MODE" = "0" ]]; then
  # Check whether WildFly is active before deployment.
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet wildfly 2>/dev/null; then
    true
  elif command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:9990/ >/dev/null 2>&1; then
    true
  elif command -v pgrep >/dev/null 2>&1 && pgrep -f "standalone.sh|org.jboss.as.standalone" >/dev/null 2>&1; then
    true
  else
    echo "WildFly inactive or not detected."
    echo "__JWEBGEN_EVENT__ server_down" >&2
    exit 1
  fi
fi

if ! run_privileged mkdir -p "$DEPLOY_DIR"; then
  echo "Insufficient permissions to create $DEPLOY_DIR."
  echo "Lance 'sudo -v' puis relance."
  echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
  exit 1
fi
if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  if ! run_privileged rm -f \
    "$DEPLOY_DIR/$APP_NAME.war" \
    "$DEPLOY_DIR/$APP_NAME.war.deployed" \
    "$DEPLOY_DIR/$APP_NAME.war.undeployed" \
    "$DEPLOY_DIR/$APP_NAME.war.failed" \
    "$DEPLOY_DIR/$APP_NAME.war.skipdeploy" \
    "$DEPLOY_DIR/$APP_NAME.war.pending" \
    "$DEPLOY_DIR/$APP_NAME.war.isdeploying" \
    "$DEPLOY_DIR/$APP_NAME.war.isundeploying" \
    "$DEPLOY_DIR/$APP_NAME.war.status" \
    "$DEPLOY_DIR/$APP_NAME.war.dodeploy"; then
    sleep 0.3
  fi
  if wildfly_cleanup_artifacts_remain; then
    if ! run_privileged rm -f \
      "$DEPLOY_DIR/$APP_NAME.war" \
      "$DEPLOY_DIR/$APP_NAME.war.deployed" \
      "$DEPLOY_DIR/$APP_NAME.war.undeployed" \
      "$DEPLOY_DIR/$APP_NAME.war.failed" \
      "$DEPLOY_DIR/$APP_NAME.war.skipdeploy" \
      "$DEPLOY_DIR/$APP_NAME.war.pending" \
      "$DEPLOY_DIR/$APP_NAME.war.isdeploying" \
      "$DEPLOY_DIR/$APP_NAME.war.isundeploying" \
      "$DEPLOY_DIR/$APP_NAME.war.status" \
      "$DEPLOY_DIR/$APP_NAME.war.dodeploy"; then
      echo "Permissions insuffisantes pour nettoyer $APP_NAME dans $DEPLOY_DIR."
      echo "Lance 'sudo -v' puis relance."
      echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
      exit 1
    fi
  fi
  if wildfly_cleanup_artifacts_remain; then
    echo "Permissions insuffisantes pour nettoyer $APP_NAME dans $DEPLOY_DIR."
    echo "Lance 'sudo -v' puis relance."
    echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
    exit 1
  fi
  echo "Dev cleanup completed for $APP_NAME (WildFly)."
  exit 0
fi
war_unchanged=0
if [[ -f "$WAR_FILE" && -f "$DEPLOY_DIR/$APP_NAME.war" ]] && cmp -s "$WAR_FILE" "$DEPLOY_DIR/$APP_NAME.war" 2>/dev/null; then
  war_unchanged=1
  echo "WAR unchanged; keeping existing artifact copy."
fi

if [[ "$war_unchanged" = "1" && "\${JWEBGEN_FORCE_WILDFLY_REDEPLOY:-0}" != "1" ]]; then
  # Verify app is actually up before skipping redeploy
  if [[ -f "$DEPLOY_DIR/$APP_NAME.war.deployed" ]] && command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 "http://127.0.0.1:$APP_HTTP_PORT/$APP_NAME/" >/dev/null 2>&1; then
    echo "WildFly: skipped redeploy (set JWEBGEN_FORCE_WILDFLY_REDEPLOY=1 to force)."
    echo "Deployed (WildFly): http://localhost:$APP_HTTP_PORT/$APP_NAME/"
    exit 0
  else
    echo "WAR unchanged but app not reachable; proceeding with deployment verification."
  fi
fi

if [[ "$war_unchanged" = "0" ]]; then
  if ! run_privileged cp "$WAR_FILE" "$DEPLOY_DIR/$APP_NAME.war"; then
    echo "Permissions insuffisantes pour copier le WAR."
    echo "Lance 'sudo -v' puis relance."
    echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
    exit 1
  fi
else
  echo "WAR unchanged but force redeploy requested (JWEBGEN_FORCE_WILDFLY_REDEPLOY=1)."
fi

run_privileged touch "$DEPLOY_DIR/$APP_NAME.war.dodeploy" || true

# Verify actual WildFly deployment result.
FAILED_MARKER="$DEPLOY_DIR/$APP_NAME.war.failed"
DEPLOYED_MARKER="$DEPLOY_DIR/$APP_NAME.war.deployed"
INPROGRESS_MARKER="$DEPLOY_DIR/$APP_NAME.war.isdeploying"
STATUS_MARKER="$DEPLOY_DIR/$APP_NAME.war.status"

DEPLOY_TIMEOUT="\${JWEBGEN_WILDFLY_DEPLOY_TIMEOUT:-20}"
if [[ ! "$DEPLOY_TIMEOUT" =~ ^[0-9]+$ ]] || (( DEPLOY_TIMEOUT < 5 )); then
  DEPLOY_TIMEOUT=20
fi
deadline=$((SECONDS + DEPLOY_TIMEOUT))
DEPLOY_HTTP_OK=0
while (( SECONDS < deadline )); do
  if [[ -f "$FAILED_MARKER" ]]; then
    echo "WildFly deployment failed."
    if [[ -f "$STATUS_MARKER" ]]; then
      echo "Detail: $(tr '\n' ' ' < "$STATUS_MARKER")"
    fi
    echo "__JWEBGEN_EVENT__ deploy_error" >&2
    exit 1
  fi
  if [[ -f "$DEPLOYED_MARKER" ]]; then
    break
  fi
  if command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 "http://127.0.0.1:$APP_HTTP_PORT/$APP_NAME/" >/dev/null 2>&1; then
    DEPLOY_HTTP_OK=1
    break
  fi
  sleep 1
done

if [[ -f "$DEPLOYED_MARKER" || "$DEPLOY_HTTP_OK" = "1" ]]; then
  if [[ "$DEPLOY_HTTP_OK" = "1" && ! -f "$DEPLOYED_MARKER" ]]; then
    echo "WildFly: application reachable (continuing without .deployed marker)."
  fi
  echo "Deployed (WildFly): http://localhost:$APP_HTTP_PORT/$APP_NAME/"
  exit 0
fi

if [[ -f "$INPROGRESS_MARKER" ]]; then
  echo "WildFly deployment still in progress (timeout)."
else
  echo "WildFly deployment not confirmed (.deployed marker missing)."
fi
echo "__JWEBGEN_EVENT__ deploy_error" >&2
exit 1
`;
  }

  return `#!/usr/bin/env bash
set -euo pipefail

echo "Unsupported target server: ${serverTarget}"
echo "Supported targets: tomcat, wildfly"
exit 1
`;
}

export function makeDeploySelectorScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
TARGET="\${JWEBGEN_SERVER_TARGET:-}"

if [[ -z "$TARGET" && -f "$SCRIPT_DIR/../.jwebgenrc" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/../.jwebgenrc" 2>/dev/null || true
  TARGET="\${JWEBGEN_SERVER_TARGET:-}"
fi

if [[ -z "$TARGET" ]]; then
  if [[ -t 0 && -t 1 ]]; then
    echo "Select server target for deployment:"
    echo "  1) tomcat"
    echo "  2) wildfly"
    while true; do
      read -r -p "Choose target [1/2, t/w]: " ans
      case "\${ans,,}" in
        1|t|tomcat)
          TARGET="tomcat"
          ;;
        2|w|wildfly)
          TARGET="wildfly"
          ;;
        *)
          echo "Invalid choice. Enter 1 (tomcat) or 2 (wildfly)."
          continue
          ;;
      esac
      break
    done
    mkdir -p "$SCRIPT_DIR/.." 2>/dev/null || true
    if [[ -f "$SCRIPT_DIR/../.jwebgenrc" ]]; then
      if grep -qE '^[[:space:]]*export[[:space:]]+JWEBGEN_SERVER_TARGET=' "$SCRIPT_DIR/../.jwebgenrc" 2>/dev/null; then
        sed -i -E 's|^[[:space:]]*export[[:space:]]+JWEBGEN_SERVER_TARGET=.*$|export JWEBGEN_SERVER_TARGET="'"$TARGET"'"|' "$SCRIPT_DIR/../.jwebgenrc" 2>/dev/null || true
      else
        printf '\nexport JWEBGEN_SERVER_TARGET="%s"\n' "$TARGET" >> "$SCRIPT_DIR/../.jwebgenrc" 2>/dev/null || true
      fi
    else
      printf 'export JWEBGEN_SERVER_TARGET="%s"\n' "$TARGET" > "$SCRIPT_DIR/../.jwebgenrc" 2>/dev/null || true
    fi
  else
    echo "Server target is not configured. Run in an interactive terminal to choose tomcat/wildfly,"
    echo "or set JWEBGEN_SERVER_TARGET (or .jwebgen/.jwebgenrc) before deploying."
    exit 1
  fi
fi

case "$TARGET" in
  tomcat)
    exec "$SCRIPT_DIR/deploy-tomcat.sh" "$@"
    ;;
  wildfly)
    exec "$SCRIPT_DIR/deploy-wildfly.sh" "$@"
    ;;
  *)
    echo "Unsupported target server: $TARGET"
    echo "Supported targets: tomcat, wildfly"
    exit 1
    ;;
esac
`;
}
