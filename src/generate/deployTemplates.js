function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

export function makeDeployTomcatScript({ appName }) {
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s 2>/dev/null || echo unknown)" != "Linux" ]]; then
  echo "Environnement non-Linux détecté. Ce script cible Linux/systemd en priorité."
  echo "Continue seulement si Tomcat local est configuré manuellement."
fi

# Couleurs pour les logs
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

APP_NAME=${shellQuote(appName)}
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TOMCAT_DIR="\${TOMCAT10:-}"
if [[ -z "$TOMCAT_DIR" ]]; then
  for d in /var/lib/tomcat10 /var/lib/tomcat; do
    if [[ -d "$d" ]]; then TOMCAT_DIR="$d"; break; fi
  done
fi
TOMCAT_DIR="\${TOMCAT_DIR:-/var/lib/tomcat10}"
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

EXPLODED_APP_DIR="$ROOT_DIR/target/$APP_NAME"

if [[ "$CLEANUP_DEV_MODE" = "0" && "\${JWEBGEN_DEV:-0}" = "1" ]]; then
  if [[ ! -d "$EXPLODED_APP_DIR" ]]; then
    log_error "Compilation requise"
    exit 1
  fi
fi

# Find WAR only after we know the directory exists
WAR_FILE=""
if [[ -d "$ROOT_DIR/target" ]]; then
  WAR_FILE="$(find "$ROOT_DIR/target" -maxdepth 1 -name '*.war' 2>/dev/null | sort | tail -n 1)" || true
fi

if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  log_action "Nettoyage dev Tomcat (app courante)"
else
  log_action "Envoi vers Tomcat"
fi

if [[ "$CLEANUP_DEV_MODE" = "0" ]]; then
  # Vérifier si Tomcat est en cours
  TOMCAT_UNIT="$(tomcat_unit_name)"
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$TOMCAT_UNIT" 2>/dev/null; then
    log_success "Tomcat actif"
  elif command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:8080/ >/dev/null 2>&1; then
    log_success "Tomcat actif (HTTP répond)"
  else
    log_error "Tomcat n'est pas actif"
    log_info "Démarre-le : sudo systemctl start $TOMCAT_UNIT"
    exit 1
  fi
fi

if ! run_privileged mkdir -p "$TOMCAT_DIR/webapps"; then
  log_error "Permissions insuffisantes pour créer $TOMCAT_DIR/webapps."
  log_info "Lance 'sudo -v' puis relance."
  echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
  exit 1
fi

if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  run_privileged rm -rf "$TOMCAT_DIR/webapps/$APP_NAME" "$TOMCAT_DIR/webapps/$APP_NAME.war" || true
  log_success "Nettoyage dev terminé pour $APP_NAME (Tomcat)."
  exit 0
fi

if [[ "\${JWEBGEN_DEV:-0}" = "1" ]]; then
  DEST_DIR="$TOMCAT_DIR/webapps/$APP_NAME"
  # Sync incrémental (rapide) plutôt qu'un delete + copie complète.
  if command -v rsync >/dev/null 2>&1; then
    if ! run_privileged rsync -a --delete "$EXPLODED_APP_DIR/" "$DEST_DIR/"; then
      log_warn "Tentative avec sudo"
      if ! sudo -n mkdir -p "$DEST_DIR" || ! sudo -n rsync -a --delete "$EXPLODED_APP_DIR/" "$DEST_DIR/"; then
        log_error "Permissions insuffisantes. Lance 'sudo -v' puis relance."
        echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
        exit 1
      fi
    fi
  else
    # Fallback simple (moins optimal) si rsync absent.
    run_privileged rm -rf "$DEST_DIR" || true
    if ! run_privileged cp -R "$EXPLODED_APP_DIR" "$DEST_DIR"; then
      log_warn "Tentative avec sudo"
      if ! sudo -n rm -rf "$DEST_DIR" 2>/dev/null || true; then true; fi
      if ! sudo -n cp -R "$EXPLODED_APP_DIR" "$DEST_DIR"; then
        log_error "Permissions insuffisantes. Lance 'sudo -v' puis relance."
        echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
        exit 1
      fi
    fi
  fi

  rm -f "$TOMCAT_DIR/webapps/$APP_NAME.war" 2>/dev/null || true
  rm -f "$ROOT_DIR/target/$APP_NAME.war" 2>/dev/null || true
  
  # Aider Tomcat à détecter les changements
  if [[ -f "$TOMCAT_DIR/webapps/$APP_NAME/META-INF/context.xml" ]]; then
    run_privileged touch "$TOMCAT_DIR/webapps/$APP_NAME/META-INF/context.xml" || true
  fi
else
  run_privileged rm -rf "$TOMCAT_DIR/webapps/$APP_NAME" "$TOMCAT_DIR/webapps/$APP_NAME.war" || true
  if [[ -z "$WAR_FILE" || ! -f "$WAR_FILE" ]]; then
    log_error "Fichier WAR introuvable"
    exit 1
  fi
  if ! run_privileged cp "$WAR_FILE" "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
    log_warn "Tentative avec sudo"
    if ! sudo -n cp "$WAR_FILE" "$TOMCAT_DIR/webapps/$APP_NAME.war"; then
      log_error "Permissions insuffisantes. Lance 'sudo -v' puis relance."
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
  echo "Environnement non-Linux détecté. Ce script cible Linux/systemd en priorité."
  echo "Continue seulement si WildFly local est configuré manuellement."
fi

APP_NAME=${shellQuote(appName)}
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

WAR_FILE="$(find "$ROOT_DIR/target" -maxdepth 1 -name '*.war' | sort | tail -n 1)"

WILDFLY_HOME="\${WILDFLY_HOME:-/opt/wildfly}"
DEPLOY_DIR="\${WILDFLY_DEPLOYMENTS:-$WILDFLY_HOME/standalone/deployments}"
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

if [[ "$CLEANUP_DEV_MODE" = "0" && ( -z "$WAR_FILE" || ! -f "$WAR_FILE" ) ]]; then
  echo "Aucun fichier WAR trouvé. Lance d'abord ./scripts/build.sh"
  echo "__JWEBGEN_EVENT__ deploy_error" >&2
  exit 1
fi

if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  echo "Nettoyage dev WildFly (app courante) : $DEPLOY_DIR/$APP_NAME.war"
else
  echo "Déploiement WildFly vers : $DEPLOY_DIR/$APP_NAME.war"
fi

if [[ "$CLEANUP_DEV_MODE" = "0" ]]; then
  # Vérifier si WildFly est actif avant déploiement.
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet wildfly 2>/dev/null; then
    true
  elif command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:9990/ >/dev/null 2>&1; then
    true
  elif command -v pgrep >/dev/null 2>&1 && pgrep -f "standalone.sh|org.jboss.as.standalone" >/dev/null 2>&1; then
    true
  else
    echo "WildFly inactif ou non détecté."
    echo "__JWEBGEN_EVENT__ server_down" >&2
    exit 1
  fi
fi

if ! run_privileged mkdir -p "$DEPLOY_DIR"; then
  echo "Permissions insuffisantes pour créer $DEPLOY_DIR."
  echo "Lance 'sudo -v' puis relance."
  echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
  exit 1
fi
if [[ "$CLEANUP_DEV_MODE" = "1" ]]; then
  run_privileged rm -f \
    "$DEPLOY_DIR/$APP_NAME.war" \
    "$DEPLOY_DIR/$APP_NAME.war.deployed" \
    "$DEPLOY_DIR/$APP_NAME.war.failed" \
    "$DEPLOY_DIR/$APP_NAME.war.isdeploying" \
    "$DEPLOY_DIR/$APP_NAME.war.status" \
    "$DEPLOY_DIR/$APP_NAME.war.dodeploy" || true
  echo "Nettoyage dev terminé pour $APP_NAME (WildFly)."
  exit 0
fi
if ! run_privileged cp "$WAR_FILE" "$DEPLOY_DIR/$APP_NAME.war"; then
  echo "Permissions insuffisantes pour copier le WAR."
  echo "Lance 'sudo -v' puis relance."
  echo "__JWEBGEN_EVENT__ deploy_sudo_required" >&2
  exit 1
fi

run_privileged touch "$DEPLOY_DIR/$APP_NAME.war.dodeploy" || true

# Vérifier le résultat réel du déploiement WildFly.
FAILED_MARKER="$DEPLOY_DIR/$APP_NAME.war.failed"
DEPLOYED_MARKER="$DEPLOY_DIR/$APP_NAME.war.deployed"
INPROGRESS_MARKER="$DEPLOY_DIR/$APP_NAME.war.isdeploying"
STATUS_MARKER="$DEPLOY_DIR/$APP_NAME.war.status"

deadline=$((SECONDS + 20))
while (( SECONDS < deadline )); do
  if [[ -f "$FAILED_MARKER" ]]; then
    echo "Déploiement WildFly échoué."
    if [[ -f "$STATUS_MARKER" ]]; then
      echo "Détail: $(tr '\n' ' ' < "$STATUS_MARKER")"
    fi
    echo "__JWEBGEN_EVENT__ deploy_error" >&2
    exit 1
  fi
  if [[ -f "$DEPLOYED_MARKER" ]]; then
    break
  fi
  sleep 1
done

if [[ ! -f "$DEPLOYED_MARKER" ]]; then
  if [[ -f "$INPROGRESS_MARKER" ]]; then
    echo "Déploiement WildFly toujours en cours (timeout)."
  else
    echo "Déploiement WildFly non confirmé (marqueur .deployed absent)."
  fi
  echo "__JWEBGEN_EVENT__ deploy_error" >&2
  exit 1
fi

echo "Déployé (WildFly) : http://localhost:8080/$APP_NAME/"
`;
  }

  return `#!/usr/bin/env bash
set -euo pipefail

echo "Serveur cible non supporté: ${serverTarget}"
echo "Cibles supportées: tomcat, wildfly"
exit 1
`;
}
