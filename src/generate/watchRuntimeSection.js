import { WATCH_PROBE_SECTION } from './watchProbeSection.js';
import { WATCH_REMEDIATION_SECTION } from './watchRemediationSection.js';

export const WATCH_RUNTIME_SECTION = `${WATCH_PROBE_SECTION}
detect_server_state() {
  local unit
  local app_http_url
  local app_status
  local management_ok=0
  local owner_line
  unit="$(server_unit_name)"
  DETECT_STATUS="down"
  DETECT_REASON=""
  DETECT_ACTION=""
  DETECT_OWNER=""
  DETECT_OWNER_PID=""
  DETECT_CONFLICT_PORT=""
  DETECT_EFFECTIVE_URL="http://localhost:$DEV_HTTP_PORT/$APP_NAME/"
  DETECT_EXPECTED_URL="$DETECT_EFFECTIVE_URL"
  app_http_url="http://127.0.0.1:$DEV_HTTP_PORT/$APP_NAME/"
  app_status=""
  if command -v curl >/dev/null 2>&1; then
    app_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$app_http_url" 2>/dev/null || echo "")"
  fi

  if [[ "$SERVER_TARGET" = "tomcat" ]]; then
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$unit" 2>/dev/null; then
      management_ok=1
    fi
    if [[ "$app_status" =~ ^(2|3) ]]; then
      DETECT_STATUS="up"
      DETECT_REASON="Tomcat répond et l'application est accessible"
      return 0
    fi
    if is_port_busy "$DEV_HTTP_PORT"; then
      owner_line="$(port_owner_summary "$DEV_HTTP_PORT" || true)"
      if [[ "$management_ok" = "1" ]]; then
        # When Tomcat is active, HTTP 404/other app status is usually a deploy/context issue,
        # not a port-conflict remediation scenario.
        DETECT_REASON="Tomcat répond mais l'URL de l'application renvoie HTTP \${app_status:-inconnu}"
        DETECT_ACTION="Vérifie le contexte /$APP_NAME/ (déploiement effectif) et les logs Tomcat."
        DETECT_OWNER=""
        DETECT_OWNER_PID=""
      else
        DETECT_CONFLICT_PORT="$DEV_HTTP_PORT"
        DETECT_OWNER="$owner_line"
        DETECT_OWNER_PID="$(extract_pid_from_owner "$owner_line")"
        DETECT_REASON="Tomcat non actif (port HTTP $DEV_HTTP_PORT occupé)"
        DETECT_ACTION="Démarre Tomcat puis traite l'occupant du port si nécessaire."
      fi
      return 0
    fi
    if [[ "$management_ok" = "1" ]]; then
      DETECT_REASON="process détecté mais endpoint HTTP indisponible"
      DETECT_ACTION="Vérifie les logs Tomcat et le port $DEV_HTTP_PORT."
      return 0
    fi
    DETECT_REASON="Tomcat non actif"
    DETECT_ACTION="sudo systemctl start $unit"
    return 0
  fi

  if command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:9990 >/dev/null 2>&1; then
    management_ok=1
  fi
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet wildfly 2>/dev/null; then
    management_ok=1
  fi
  if [[ "$app_status" =~ ^(2|3) ]]; then
    DETECT_STATUS="up"
    DETECT_REASON="WildFly répond et l'application est accessible"
    return 0
  fi
  if is_port_busy "$DEV_HTTP_PORT"; then
    owner_line="$(port_owner_summary "$DEV_HTTP_PORT" || true)"
    if [[ "$management_ok" = "1" ]]; then
      # Same priority rule as Tomcat: when server engine is already up,
      # app HTTP failures are handled as deploy/context issues first.
      DETECT_REASON="WildFly répond mais l'URL de l'application renvoie HTTP \${app_status:-inconnu}"
      DETECT_ACTION="Vérifie le contexte /$APP_NAME/ et les marqueurs deployments (.deployed/.failed)."
      DETECT_OWNER=""
      DETECT_OWNER_PID=""
    else
      DETECT_CONFLICT_PORT="$DEV_HTTP_PORT"
      DETECT_OWNER="$owner_line"
      DETECT_OWNER_PID="$(extract_pid_from_owner "$owner_line")"
      DETECT_REASON="WildFly non actif (port HTTP $DEV_HTTP_PORT occupé)"
      DETECT_ACTION="Démarre WildFly puis traite l'occupant du port si nécessaire."
    fi
    return 0
  fi
  if [[ "$management_ok" = "1" ]]; then
    DETECT_REASON="WildFly répond mais l'URL de l'application renvoie HTTP \${app_status:-inconnu}"
    DETECT_ACTION="Vérifie le contexte /$APP_NAME/ et les marqueurs deployments (.deployed/.failed)."
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet wildfly 2>/dev/null; then
    DETECT_REASON="service WildFly actif mais endpoint 9990 indisponible"
    DETECT_ACTION="Vérifie bind/ports (9990/$DEV_HTTP_PORT) et les logs: sudo journalctl -u wildfly -n 200"
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1; then
    local wf_load
    wf_load="$(systemctl show wildfly -p LoadState --value 2>/dev/null || echo "")"
    if [[ -n "$wf_load" && "$wf_load" != "not-found" ]] && ! systemctl is-active --quiet wildfly 2>/dev/null; then
      DETECT_REASON="WildFly installé (unité systemd wildfly) mais arrêté"
      DETECT_ACTION="sudo systemctl start wildfly"
      return 0
    fi
  fi
  if command -v pgrep >/dev/null 2>&1 && pgrep -f "standalone.sh|org.jboss.as.standalone" >/dev/null 2>&1; then
    DETECT_REASON="process WildFly détecté mais endpoint 9990 indisponible"
    DETECT_ACTION="Vérifie bind/ports (9990/8080) et les logs WildFly."
    return 0
  fi
  if [[ -n "\${WILDFLY_HOME:-}" && -x "\${WILDFLY_HOME}/bin/standalone.sh" ]]; then
    DETECT_REASON="WildFly installé mais inactif"
    DETECT_ACTION="Démarre WildFly: sudo systemctl start wildfly ou \${WILDFLY_HOME}/bin/standalone.sh -b 0.0.0.0"
    return 0
  fi
  DETECT_REASON="WildFly non détecté (ni service, ni endpoint 9990)"
  DETECT_ACTION="Installe/configure WildFly puis démarre le service wildfly."
  return 0
}

server_is_running() {
  server_engine_is_running
}
server_engine_is_running() {
  local unit
  unit="$(server_unit_name)"
  if [[ "$SERVER_TARGET" = "wildfly" ]]; then
    if command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:9990 >/dev/null 2>&1; then
      return 0
    fi
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet wildfly 2>/dev/null; then
      return 0
    fi
    return 1
  fi
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$unit" 2>/dev/null; then
    return 0
  fi
  return 1
}

start_server_noninteractive() {
  local unit
  local restart_mode="\${1:-0}"
  unit="$(server_unit_name)"
  if ! command -v systemctl >/dev/null 2>&1; then
    DETECT_REASON="systemctl indisponible"
    DETECT_ACTION="Démarre le serveur manuellement puis relance dev/watch."
    return 1
  fi
  if [[ "$restart_mode" = "1" ]]; then
    if ! sudo -n systemctl restart "$unit" 2>/dev/null; then
      return 1
    fi
  elif ! sudo -n systemctl start "$unit" 2>/dev/null; then
    return 1
  fi
  if [[ "$SERVER_TARGET" = "wildfly" ]]; then
    local waited=0
    local max_wait=90
    while (( waited < max_wait )); do
      if command -v curl >/dev/null 2>&1 && curl -sS --max-time 2 http://127.0.0.1:9990 >/dev/null 2>&1; then
        DETECT_STATUS="up"
        DETECT_REASON="endpoint management WildFly actif (9990)"
        return 0
      fi
      sleep 2
      waited=$((waited + 2))
    done
    server_engine_is_running
    return $?
  fi
  sleep 2
  server_engine_is_running
  return $?
}

show_server_help() {
  local unit
  local owner_pid=""
  local owner_name=""
  local owner_port=""
  local owner_compact=""
  local action_hint=""
  unit="$(server_unit_name)"
  ui_info "Diagnostic: $DETECT_REASON"
  if [[ -n "$DETECT_EXPECTED_URL" ]]; then
    ui_info "URL attendue: $DETECT_EXPECTED_URL"
  fi
  if [[ -n "$DETECT_OWNER" ]]; then
    owner_pid="$(extract_pid_from_owner "$DETECT_OWNER")"
    owner_name="$(printf '%s' "$DETECT_OWNER" | sed -n 's/.*users:((\"\\([^\"]*\\)\".*/\\1/p' | head -n 1)"
    owner_port="$(printf '%s' "$DETECT_OWNER" | sed -n 's/.*:\\([0-9][0-9]*\\)[[:space:]].*/\\1/p' | head -n 1)"
    if [[ -n "$owner_pid" && -n "$owner_name" ]]; then
      owner_compact="pid=$owner_pid cmd=$owner_name"
    elif [[ -n "$owner_pid" ]]; then
      owner_compact="pid=$owner_pid"
    elif [[ -n "$owner_name" ]]; then
      owner_compact="cmd=$owner_name"
    elif [[ -n "$owner_port" ]]; then
      owner_compact="port=$owner_port (pid inconnu)"
    else
      owner_compact="processus non identifié"
    fi
    ui_info "Occupant: $owner_compact"
  fi
  if [[ -n "$DETECT_ACTION" ]]; then
    ui_info "Action suggérée: $DETECT_ACTION"
  fi
  if [[ -n "$DETECT_CONFLICT_PORT" ]]; then
    if [[ "$DETECT_REASON" =~ (non\ actif|arrêté|inactif|non\ détecté) ]]; then
      action_hint="[d] démarrer serveur  [f] refresh  [a] aide  [q] quit"
    elif [[ -n "$DETECT_OWNER_PID" ]]; then
      action_hint="[k] kill pid $DETECT_OWNER_PID  [s] stop service  [f] refresh  [a] aide  [q] quit"
    else
      action_hint="[i] inspecter  [x] kill port  [f] refresh  [a] aide  [q] quit"
    fi
    ui_info "Actions auto: $action_hint"
    if [[ -z "$DETECT_OWNER_PID" ]]; then
      ui_info "Kill progressif: inspecter puis kill port avec confirmation."
    fi
    ui_info "Inspecter: ss -lntp | rg ':$DETECT_CONFLICT_PORT'"
    return 0
  fi
  if [[ "$DETECT_REASON" =~ (non\ actif|arrêté|inactif|non\ détecté) ]]; then
    action_hint="[d] démarrer serveur  [f] refresh  [a] aide  [q] quit"
    ui_info "Actions auto: $action_hint"
    if [[ "$SERVER_TARGET" = "wildfly" ]]; then
      ui_info "Commande: sudo systemctl start wildfly"
    else
      ui_info "Commande: sudo systemctl start $unit"
    fi
  else
    if [[ "$DETECT_REASON" == *"renvoie HTTP"* ]]; then
      action_hint="[r] redéployer  [i] inspecter  [f] refresh  [a] aide  [q] quit"
      ui_info "Actions auto: $action_hint"
      ui_info "Contexte app: /$APP_NAME/"
    elif [[ "$SERVER_TARGET" = "wildfly" && "$DETECT_REASON" == *"HTTP 000"* ]]; then
      action_hint="[d] redémarrer serveur  [f] refresh  [a] aide  [q] quit"
      ui_info "Actions auto: $action_hint"
      ui_info "Commande: sudo systemctl restart wildfly"
    else
      action_hint="[f] refresh  [a] aide  [q] quit"
      ui_info "Actions auto: $action_hint"
    fi
  fi
  if [[ "$SERVER_TARGET" = "wildfly" ]]; then
    ui_info "Logs: journalctl -u wildfly -n 80"
  fi
}

show_deploy_help() {
  if [[ "$SERVER_TARGET" = "wildfly" ]]; then
    ui_info "Aide déploiement WildFly:"
    ui_info "- Vérifie que wildfly est actif: sudo systemctl status wildfly"
    ui_info "- Vérifie les ports: ss -lntp | rg ':9990|:8080'"
    ui_info "- Vérifie les marqueurs deployments: .deployed/.failed/.isdeploying"
    ui_info "- Vérifie les droits sur deployments (WILDFLY_HOME/WILDFLY_DEPLOYMENTS)"
    ui_info "- Recharge sudo si nécessaire: sudo -v"
  else
    ui_info "Aide déploiement Tomcat:"
    ui_info "- Vérifie les droits sur TOMCAT10/webapps"
    ui_info "- Recharge sudo si nécessaire: sudo -v"
  fi
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    ui_err "Node.js est requis pour le mode dev."
    ui_info "Installe Node 18+ puis relance (ex: nvm install 20)."
    exit 1
  fi
}

stop_dashboard() {
  if [[ -n "$DASHBOARD_PID" ]]; then
    kill "$DASHBOARD_PID" 2>/dev/null || true
    wait "$DASHBOARD_PID" 2>/dev/null || true
    DASHBOARD_PID=""
  fi
}
start_dashboard() {
  if [[ "$JWEBGEN_VERBOSE" = "1" ]]; then return 0; fi
  node "$DASHBOARD_SCRIPT" "$STATE_FILE" "$UI_PAUSE_FILE" "$$" 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD &
  DASHBOARD_PID="$!"
}

start_worker() {
  node "$WORKER_SCRIPT" "$STATE_FILE" "$EVENTS_FILE" "$UI_PAUSE_FILE" "$$" &
  WORKER_PID="$!"
}
restart_worker() {
  if [[ -n "$WORKER_PID" ]]; then
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
    WORKER_PID=""
  fi
  start_worker
  LAST_WORKER_RESTART_AT="$(date +%s 2>/dev/null || echo 0)"
}

${WATCH_REMEDIATION_SECTION}
`;
