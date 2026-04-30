export const WATCH_REMEDIATION_SECTION = `needs_server_start() {
  [[ "$DETECT_REASON" =~ (non\ actif|arrêté|inactif|non\ détecté) ]]
}

wait_for_port_release() {
  local port="$1"
  local tries=3
  while (( tries > 0 )); do
    if ! is_port_busy "$port"; then
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

owner_systemd_unit_from_pid() {
  local pid="$1"
  local line=""
  local unit=""
  if [[ -z "$pid" ]] || ! command -v systemctl >/dev/null 2>&1; then
    return 1
  fi
  line="$(systemctl --no-pager --plain status "$pid" 2>/dev/null | sed -n 's/.*CGroup: .*\\/\\([^/[:space:]]\\+\\.service\\).*/\\1/p' | head -n 1)"
  unit="$(printf '%s' "$line" | tr -d '[:space:]')"
  if [[ -z "$unit" ]]; then
    line="$(systemctl status "$pid" 2>/dev/null | sed -n 's/.*Loaded: .*\\([^/[:space:]]\\+\\.service\\).*/\\1/p' | head -n 1)"
    unit="$(printf '%s' "$line" | tr -d '[:space:]')"
  fi
  if [[ -n "$unit" ]]; then
    printf '%s' "$unit"
    return 0
  fi
  return 1
}

persist_dev_http_port_if_possible() {
  local new_port="$1"
  local cfg="$ROOT_DIR/.jwebgenrc"
  if [[ ! -f "$cfg" ]]; then
    return 1
  fi
  if rg -q '^export JWEBGEN_HTTP_PORT=' "$cfg" 2>/dev/null; then
    sed -i -E "s/^export JWEBGEN_HTTP_PORT=.*/export JWEBGEN_HTTP_PORT=\\"$new_port\\"/" "$cfg" 2>/dev/null || true
  else
    printf 'export JWEBGEN_HTTP_PORT="%s"\\n' "$new_port" >> "$cfg"
  fi
  return 0
}

apply_validated_http_port_fallback() {
  local old_port="$DEV_HTTP_PORT"
  local candidate
  local switched=0
  for candidate in 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090; do
    if is_port_busy "$candidate"; then
      continue
    fi
    DEV_HTTP_PORT="$candidate"
    export JWEBGEN_HTTP_PORT="$candidate"
    detect_server_state
    if start_server_noninteractive 1 || start_server_noninteractive; then
      restart_worker
      detect_server_state
      if [[ "$DETECT_STATUS" = "up" ]]; then
        switched=1
        ui_info "Port HTTP changé et validé: $old_port -> $candidate"
        persist_dev_http_port_if_possible "$candidate" || true
        break
      fi
    fi
  done
  if [[ "$switched" = "1" ]]; then
    return 0
  fi
  DEV_HTTP_PORT="$old_port"
  export JWEBGEN_HTTP_PORT="$old_port"
  ui_warn "Impossible de valider un fallback de port HTTP."
  return 1
}

compact_cause_label() {
  if needs_server_start; then
    printf 'SERVER_DOWN'
    return 0
  fi
  if [[ -n "$DETECT_CONFLICT_PORT" ]]; then
    printf 'PORT_CONFLICT'
    return 0
  fi
  if [[ "$DETECT_REASON" == *"HTTP 404"* ]]; then
    printf 'APP_HTTP_404'
    return 0
  fi
  if [[ "$DETECT_REASON" == *"HTTP 000"* ]]; then
    printf 'APP_HTTP_000'
    return 0
  fi
  if [[ "$DETECT_REASON" == *"renvoie HTTP"* ]]; then
    printf 'APP_HTTP_OTHER'
    return 0
  fi
  printf 'UNKNOWN'
}

prompt_server_remediation() {
  local answer
  local discard
  local confirm
  local force_kill_confirm
  local last_reason_shown=""
  local cause_label=""
  local options="[f]refresh / [a]ide / [q]uit"
  local has_conflict=0
  local has_pid_conflict=0
  local app_down_like=0
  local wildfly_http000=0
  local header_shown=0
  local primary_key="f"
  local primary_label="refresh"
  local start_needed=0
  local prompt_subject=""
  local conflict_unit=""
  pause_ui
  stop_dashboard
  if [[ "$TTY_IN_FD" -ne 3 ]]; then
    ui_warn "Mode non-interactif: impossible d'ouvrir /dev/tty pour le prompt."
    show_server_help
    resume_ui
    start_dashboard
    return 1
  fi
  while true; do
    detect_server_state
    if [[ "$DETECT_STATUS" = "up" ]]; then
      resume_ui
      start_dashboard
      return 0
    fi
    if [[ "$header_shown" = "0" ]]; then
      printf "\\n--- Remédiation %s ---\\n" "$(server_label)" >&$TTY_OUT_FD
      header_shown=1
    fi
    has_conflict=0
    has_pid_conflict=0
    app_down_like=0
    wildfly_http000=0
    start_needed=0
    primary_key="f"
    primary_label="refresh"
    if needs_server_start; then
      start_needed=1
      primary_key="d"
      primary_label="démarrer"
    elif [[ "$SERVER_TARGET" = "wildfly" && "$DETECT_REASON" == *"HTTP 000"* ]]; then
      wildfly_http000=1
      start_needed=1
      primary_key="d"
      primary_label="redémarrer"
    fi
    if [[ "$primary_key" = "f" ]]; then
      options="[f]refresh / [a]ide / [q]uit"
    else
      options="[\${primary_key}]\${primary_label} / [f]refresh / [a]ide / [q]uit"
    fi
    if [[ -n "$DETECT_CONFLICT_PORT" ]]; then
      has_conflict=1
      options="[f]refresh / [a]ide / [q]uit"
      if [[ "$start_needed" = "1" ]]; then
        if [[ -n "$DETECT_OWNER_PID" ]]; then
          has_pid_conflict=1
          options="[\${primary_key}]\${primary_label} / [k]ill occupant / [s]top service / [f]refresh / [a]ide / [q]uit"
        else
          options="[\${primary_key}]\${primary_label} / [i]inspecter / [x]kill port / [f]refresh / [a]ide / [q]uit"
        fi
      elif [[ -n "$DETECT_OWNER_PID" ]]; then
        has_pid_conflict=1
        options="[k]ill occupant / [s]top service / [c]hange port / [f]refresh / [a]ide / [q]uit"
      else
        options="[i]inspecter / [x]kill port / [c]hange port / [f]refresh / [a]ide / [q]uit"
      fi
    elif [[ "$DETECT_REASON" == *"renvoie HTTP"* ]]; then
      app_down_like=1
      if [[ "$wildfly_http000" = "1" ]]; then
        options="[r]redéployer+redémarrer / [i]inspecter / [f]refresh / [a]ide / [q]uit"
      else
        options="[r]redéployer / [i]inspecter / [f]refresh / [a]ide / [q]uit"
      fi
    fi
    if [[ -n "$DETECT_REASON" && "$DETECT_REASON" != "$last_reason_shown" ]]; then
      cause_label="$(compact_cause_label)"
      ui_warn "Cause: $cause_label"
      ui_info "Pourquoi: $DETECT_REASON"
      last_reason_shown="$DETECT_REASON"
    fi
    prompt_subject="$(server_label) indisponible"
    if [[ "$DETECT_REASON" == *"renvoie HTTP"* ]]; then
      prompt_subject="Application inaccessible (/$APP_NAME/)"
    fi
    printf "\\n%s. %s ? " "$prompt_subject" "$options" >&$TTY_OUT_FD
    IFS= read -rsn1 answer <&$TTY_IN_FD || { resume_ui; start_dashboard; return 1; }
    if [[ "$answer" == $'\\e' ]]; then
      IFS= read -rsn2 -t 0.02 discard <&$TTY_IN_FD || true
      printf '\\r\\033[2K' >&$TTY_OUT_FD || true
      continue
    fi
    printf '\\r\\033[2K' >&$TTY_OUT_FD || true
    case "$answer" in
      [Kk])
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" != "1" ]]; then
          ui_warn "Option non disponible dans ce menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_CONFLICT_PORT" ]]; then
          ui_warn "Aucun conflit de port détecté actuellement."
          continue
        fi
        if [[ -z "$DETECT_OWNER_PID" ]]; then
          ui_warn "PID non identifié pour le port $DETECT_CONFLICT_PORT."
          ui_info "Inspecte avec: ss -lntp | rg ':$DETECT_CONFLICT_PORT'"
          continue
        fi
        if [[ -f "$STATE_FILE" ]]; then
          if ! rg -q "\"pid\"\\s*:\\s*\${DETECT_OWNER_PID}" "$STATE_FILE" 2>/dev/null; then
            ui_warn "Refus: ce PID n'appartient pas à jwebgen (sécurité)."
            ui_info "Stoppe-le manuellement si tu es sûr, ou utilise un autre port."
            continue
          fi
        else
          ui_warn "Refus: état jwebgen absent, impossible de vérifier la propriété du PID."
          continue
        fi
        printf "\\nConfirmer l'arrêt du PID %s sur port %s ? [y/N] " "$DETECT_OWNER_PID" "$DETECT_CONFLICT_PORT" >&$TTY_OUT_FD
        IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation annulée."; continue; }
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
          local killed_ok=0
          if kill "$DETECT_OWNER_PID" 2>/dev/null; then
            ui_info "Processus $DETECT_OWNER_PID arrêté."
            killed_ok=1
          elif sudo -n kill "$DETECT_OWNER_PID" 2>/dev/null; then
            ui_info "Processus $DETECT_OWNER_PID arrêté avec sudo."
            killed_ok=1
          else
            ui_err "Impossible d'arrêter le processus $DETECT_OWNER_PID."
          fi
          if [[ "$killed_ok" = "1" ]]; then
          if ! wait_for_port_release "$DETECT_CONFLICT_PORT"; then
            detect_server_state
            ui_warn "Le port $DETECT_CONFLICT_PORT est repris automatiquement."
            if [[ -n "$DETECT_OWNER" ]]; then
              ui_info "Nouveau process occupant: $DETECT_OWNER"
            fi
            continue
          fi
            if start_server_noninteractive 1 || start_server_noninteractive; then
              restart_worker
              detect_server_state
              if [[ "$DETECT_STATUS" = "up" ]]; then
                resume_ui
                start_dashboard
                return 0
              fi
            fi
          fi
        else
          ui_info "Arrêt annulé."
        fi
        ;;
      [Ii])
        if [[ "$app_down_like" = "1" ]]; then
          printf "\\nInspection rapide %s:\\n" "$(server_label)" >&$TTY_OUT_FD
          if [[ "$SERVER_TARGET" = "wildfly" ]]; then
            ui_info "Vérifie: ls -la \${WILDFLY_DEPLOYMENTS:-\${WILDFLY_HOME:-/opt/wildfly}/standalone/deployments} | rg '$APP_NAME|failed|deployed'"
            ui_info "Vérifie: journalctl -u wildfly -n 120"
          else
            ui_info "Vérifie: ls -la \${TOMCAT10:-/var/lib/tomcat10}/webapps | rg '$APP_NAME'"
            ui_info "Vérifie: journalctl -u $(server_unit_name) -n 120"
          fi
          ui_info "Ensuite: appuie sur [r] pour redéployer ou [f] pour refresh."
          continue
        fi
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" = "1" ]]; then
          ui_warn "Option non disponible dans ce menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_CONFLICT_PORT" ]]; then
          ui_warn "Aucun conflit de port détecté actuellement."
          continue
        fi
        if [[ -n "$DETECT_OWNER" ]]; then
          ui_info "Occupant actuel: $DETECT_OWNER"
        else
          ui_warn "Occupant toujours non identifié pour le port $DETECT_CONFLICT_PORT."
        fi
        ;;
      [Xx])
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" = "1" ]]; then
          ui_warn "Option non disponible dans ce menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_CONFLICT_PORT" ]]; then
          ui_warn "Aucun conflit de port détecté actuellement."
          continue
        fi
        printf "\\nConfirmer kill du port %s via fuser -k ? [y/N] " "$DETECT_CONFLICT_PORT" >&$TTY_OUT_FD
        IFS= read -r force_kill_confirm <&$TTY_IN_FD || { ui_warn "Confirmation annulée."; continue; }
        if [[ ! "$force_kill_confirm" =~ ^[Yy]$ ]]; then
          ui_info "Kill port annulé."
          continue
        fi
        local killed_port_ok=0
        if fuser -k -n tcp "$DETECT_CONFLICT_PORT" >/dev/null 2>&1; then
          ui_info "Port $DETECT_CONFLICT_PORT libéré."
          killed_port_ok=1
        elif sudo -n fuser -k -n tcp "$DETECT_CONFLICT_PORT" >/dev/null 2>&1; then
          ui_info "Port $DETECT_CONFLICT_PORT libéré avec sudo."
          killed_port_ok=1
        else
          ui_err "Impossible de libérer le port $DETECT_CONFLICT_PORT."
          ui_info "Essaye: sudo fuser -k -n tcp $DETECT_CONFLICT_PORT"
        fi
        if [[ "$killed_port_ok" = "1" ]]; then
          if ! wait_for_port_release "$DETECT_CONFLICT_PORT"; then
            detect_server_state
            ui_warn "Le port $DETECT_CONFLICT_PORT est repris automatiquement."
            if [[ -n "$DETECT_OWNER" ]]; then
              ui_info "Nouveau process occupant: $DETECT_OWNER"
            fi
            continue
          fi
          if start_server_noninteractive 1 || start_server_noninteractive; then
            restart_worker
            detect_server_state
            if [[ "$DETECT_STATUS" = "up" ]]; then
              resume_ui
              start_dashboard
              return 0
            fi
          fi
        fi
        ;;
      [Ss])
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" != "1" ]]; then
          ui_warn "Option non disponible dans ce menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_OWNER_PID" ]]; then
          ui_warn "PID occupant introuvable."
          continue
        fi
        conflict_unit="$(owner_systemd_unit_from_pid "$DETECT_OWNER_PID" || true)"
        if [[ -z "$conflict_unit" ]]; then
          ui_warn "Impossible d'identifier un service systemd pour ce PID."
          if [[ -n "$DETECT_OWNER" ]]; then
            ui_info "Occupant: $DETECT_OWNER"
          fi
          continue
        fi
        if [[ "$conflict_unit" = "$(server_unit_name).service" || "$conflict_unit" = "$(server_unit_name)" ]]; then
          ui_warn "Le service détecté est le serveur cible lui-même: $conflict_unit"
          continue
        fi
        printf "\\nConfirmer stop du service %s ? [y/N] " "$conflict_unit" >&$TTY_OUT_FD
        IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation annulée."; continue; }
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
          ui_info "Stop service annulé."
          continue
        fi
        if ! sudo -n systemctl stop "$conflict_unit" 2>/dev/null; then
          ui_err "Impossible d'arrêter $conflict_unit."
          ui_info "Commande: sudo systemctl stop $conflict_unit"
          continue
        fi
        ui_info "Service arrêté: $conflict_unit"
        if ! wait_for_port_release "$DETECT_CONFLICT_PORT"; then
          detect_server_state
          ui_warn "Le port reste occupé après stop de $conflict_unit."
          continue
        fi
        if start_server_noninteractive 1 || start_server_noninteractive; then
          restart_worker
          detect_server_state
          if [[ "$DETECT_STATUS" = "up" ]]; then
            resume_ui
            start_dashboard
            return 0
          fi
        fi
        ;;
      [Cc])
        if [[ "$has_conflict" != "1" ]]; then
          ui_warn "Option non disponible dans ce menu."
          continue
        fi
        if apply_validated_http_port_fallback; then
          resume_ui
          start_dashboard
          return 0
        fi
        ;;
      [Ff])
        printf "\\n" >&$TTY_OUT_FD
        restart_worker
        detect_server_state
        if [[ "$DETECT_STATUS" = "up" ]]; then
          resume_ui
          start_dashboard
          return 0
        fi
        ui_warn "Toujours inaccessible après refresh."
        ;;
      [Rr])
        if [[ "$app_down_like" != "1" ]]; then
          ui_warn "Option non disponible dans ce menu."
          continue
        fi
        ui_info "Tentative de redéploiement rapide..."
        restart_worker
        sleep 1
        detect_server_state
        if [[ "$DETECT_STATUS" = "up" ]]; then
          resume_ui
          start_dashboard
          return 0
        fi
        ui_warn "Application toujours inaccessible après redéploiement."
        continue
        ;;
      [Dd])
        if [[ "$start_needed" = "1" ]]; then
          if [[ "$SERVER_TARGET" = "wildfly" ]]; then
            local wf_load
            wf_load="$(systemctl show wildfly -p LoadState --value 2>/dev/null || echo not-found)"
            if [[ "$wf_load" != "not-found" ]]; then
              true
            elif [[ -n "\${WILDFLY_HOME:-}" && -x "\${WILDFLY_HOME}/bin/standalone.sh" ]]; then
              ui_warn "WildFly détecté via WILDFLY_HOME, mais le redémarrage auto utilise systemd."
              ui_info "Lance manuellement: \${WILDFLY_HOME}/bin/standalone.sh -b 0.0.0.0"
              continue
            else
              ui_warn "WildFly non détecté: redémarrage automatique impossible."
              show_server_help
              continue
            fi
          fi

          printf "\\nAuthentification sudo requise...\\n" >&$TTY_OUT_FD
          if ! sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD; then
            ui_err "Authentification sudo échouée."
            continue
          fi
          if start_server_noninteractive "$wildfly_http000"; then
            restart_worker
            resume_ui
            start_dashboard
            return 0
          fi
          ui_err "Démarrage automatique impossible."
          show_server_help
          continue
        fi
        ui_warn "Option non disponible dans ce menu."
        ;;
      [Aa])
        printf "\\n--- Aide %s ---\\n" "$(server_label)" >&$TTY_OUT_FD
        show_server_help
        ;;
      [Qq])
        resume_ui
        return 1
        ;;
      *)
        ui_warn "Option non disponible dans ce menu."
        ;;
    esac
  done
}

prompt_deploy_remediation() {
  local answer
  local discard
  pause_ui
  stop_dashboard
  if [[ "$TTY_IN_FD" -ne 3 ]]; then
    ui_warn "Mode non-interactif: impossible d'ouvrir /dev/tty pour le prompt."
    show_deploy_help
    resume_ui
    start_dashboard
    return 1
  fi
  printf "\\n--- Remédiation déploiement ---\\n" >&$TTY_OUT_FD
  while true; do
    printf "\\nDéploiement en erreur. [f]refresh / [a]ide / [q]uit ? " >&$TTY_OUT_FD
    IFS= read -rsn1 answer <&$TTY_IN_FD || { resume_ui; start_dashboard; return 1; }
    if [[ "$answer" == $'\\e' ]]; then
      IFS= read -rsn2 -t 0.02 discard <&$TTY_IN_FD || true
      printf '\\r\\033[2K' >&$TTY_OUT_FD || true
      continue
    fi
    printf '\\r\\033[2K' >&$TTY_OUT_FD || true
    case "$answer" in
      [Ff])
        restart_worker
        resume_ui
        start_dashboard
        return 0
        ;;
      [Aa])
        printf "\\n--- Aide déploiement ---\\n" >&$TTY_OUT_FD
        show_deploy_help
        ;;
      [Qq])
        resume_ui
        start_dashboard
        return 1
        ;;
      *)
        ui_warn "Option non disponible dans ce menu."
        ;;
    esac
  done
}

manual_refresh() {
  ui_info "Refresh manuel: revalidation de l'état dev..."
  detect_server_state
  restart_worker
  if [[ "$DETECT_STATUS" = "up" ]]; then
    ui_info "État OK: $(server_label) et application accessibles."
    return 0
  fi
  ui_warn "Refresh: anomalie détectée après revalidation."
  show_server_help
  if ! prompt_server_remediation; then
    ui_warn "dev:stop (refresh unresolved)"
    stop_all
    return 130
  fi
  return 0
}

poll_runtime_commands() {
  local answer
  local discard
  if [[ "$TTY_IN_FD" -ne 3 ]]; then
    return 0
  fi
  if ! IFS= read -rsn1 -t 0.02 answer <&$TTY_IN_FD; then
    return 0
  fi
  if [[ "$answer" == $'\\e' ]]; then
    IFS= read -rsn2 -t 0.02 discard <&$TTY_IN_FD || true
    printf '\\r\\033[2K' >&$TTY_OUT_FD || true
    return 0
  fi
  case "$answer" in
    [Ff])
      printf '\\r\\033[2K' >&$TTY_OUT_FD || true
      manual_refresh || return 130
      ;;
    *)
      ;;
  esac
  return 0
}

handle_events_loop() {
  local offset=0
  local ev_port
  local ev_owner
  local ev_from
  local ev_to
  local now_ts
  local last_deploy_sudo_ts=0
  local last_fault_reason=""
  local last_fault_seen_at=0
  while true; do
    if ! poll_runtime_commands; then
      return 130
    fi
    if [[ -n "$WORKER_PID" ]] && ! kill -0 "$WORKER_PID" 2>/dev/null; then
      break
    fi
    if [[ -f "$EVENTS_FILE" ]]; then
      local total
      total="$(wc -l < "$EVENTS_FILE" | tr -d ' ')"
      if [[ "$total" -gt "$offset" ]]; then
        while IFS= read -r line; do
          if [[ "$line" == *'"type":"server_down"'* ]]; then
            detect_server_state
            if [[ "$DETECT_STATUS" = "up" ]]; then
              continue
            fi
            now_ts="$(date +%s 2>/dev/null || echo 0)"
            if [[ "$LAST_WORKER_RESTART_AT" != "0" ]] && (( now_ts - LAST_WORKER_RESTART_AT < 3 )); then
              continue
            fi
            if [[ "$DETECT_REASON" == "$last_fault_reason" ]] && (( now_ts - last_fault_seen_at < 2 )); then
              continue
            fi
            last_fault_reason="$DETECT_REASON"
            last_fault_seen_at="$now_ts"
            if ! prompt_server_remediation; then
              ui_warn "dev:stop ($(server_label) down)"
              show_server_help
              stop_all
              return 130
            fi
          elif [[ "$line" == *'"type":"http_port_conflict"'* ]]; then
            ev_port="$(printf '%s' "$line" | sed -n 's/.*"port":\\([0-9][0-9]*\\).*/\\1/p')"
            ev_owner="$(printf '%s' "$line" | sed -n 's/.*"owner":"\\([^"]*\\)".*/\\1/p')"
            ui_warn "Conflit port HTTP: \${ev_port:-$DEV_HTTP_PORT}"
            if [[ -n "$ev_owner" ]]; then
              ui_info "Occupant: $ev_owner"
            fi
            detect_server_state
            if [[ "$DETECT_STATUS" = "up" ]]; then
              continue
            fi
            now_ts="$(date +%s 2>/dev/null || echo 0)"
            if [[ "$LAST_WORKER_RESTART_AT" != "0" ]] && (( now_ts - LAST_WORKER_RESTART_AT < 3 )); then
              continue
            fi
            if ! prompt_server_remediation; then
              ui_warn "dev:stop (port conflict)"
              show_server_help
              stop_all
              return 130
            fi
          elif [[ "$line" == *'"type":"live_port_busy"'* ]]; then
            ev_port="$(printf '%s' "$line" | sed -n 's/.*"port":\\([0-9][0-9]*\\).*/\\1/p')"
            ev_owner="$(printf '%s' "$line" | sed -n 's/.*"owner":"\\([^"]*\\)".*/\\1/p')"
            ui_warn "LiveReload port occupé: \${ev_port:-$LIVE_PORT}"
            if [[ -n "$ev_owner" ]]; then
              ui_info "Occupant: $ev_owner"
            fi
          elif [[ "$line" == *'"type":"live_port_fallback"'* ]]; then
            ev_from="$(printf '%s' "$line" | sed -n 's/.*"fromPort":\\([0-9][0-9]*\\).*/\\1/p')"
            ev_to="$(printf '%s' "$line" | sed -n 's/.*"toPort":\\([0-9][0-9]*\\).*/\\1/p')"
            ui_info "LiveReload: fallback auto \${ev_from:-$LIVE_PORT} -> \${ev_to:-inconnu}"
          elif [[ "$line" == *'"type":"app_unreachable"'* ]]; then
            ui_warn "Serveur actif mais application inaccessible sur /$APP_NAME/."
            ui_info "Vérifie le déploiement puis relance [f]refresh si nécessaire."
          elif [[ "$line" == *'"type":"deploy_sudo_required"'* ]]; then
            now_ts="$(date +%s 2>/dev/null || echo 0)"
            if (( now_ts - last_deploy_sudo_ts < 8 )); then
              continue
            fi
            last_deploy_sudo_ts="$now_ts"
            pause_ui
            stop_dashboard
            printf "\nDéploiement: permissions insuffisantes. Authentification sudo requise...\n" >&$TTY_OUT_FD
            if sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD; then
              restart_worker
              resume_ui
              start_dashboard
            else
              ui_err "Authentification sudo échouée. Lance 'sudo -v' puis relance."
              resume_ui
              start_dashboard
            fi
          elif [[ "$line" == *'"type":"deploy_error"'* ]]; then
            now_ts="$(date +%s 2>/dev/null || echo 0)"
            if [[ "$LAST_WORKER_RESTART_AT" != "0" ]] && (( now_ts - LAST_WORKER_RESTART_AT < 3 )); then
              continue
            fi
            if ! prompt_deploy_remediation; then
              ui_warn "dev:stop (deploy error)"
              show_deploy_help
              stop_all
              return 130
            fi
          fi
        done < <(sed -n "$((offset + 1)),$((total))p" "$EVENTS_FILE")
        offset="$total"
      fi
    fi
    sleep 1
  done
  return 0
}

stop_all() {
  stop_dashboard
  if [[ -n "$WORKER_PID" ]]; then
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
    WORKER_PID=""
  fi
}

cleanup() {
  if [[ "$CLEANUP_DONE" = "1" ]]; then return; fi
  CLEANUP_DONE=1
  resume_ui
  stop_all
  if [[ -x "$ROOT_DIR/scripts/deploy.sh" ]]; then
    "$ROOT_DIR/scripts/deploy.sh" --cleanup-dev >/dev/null 2>&1 || true
  fi
  if [[ "\${JWEBGEN_KEEP_DEV_FILES:-0}" != "1" ]]; then
    rm -f "$WORKER_SCRIPT" "$DASHBOARD_SCRIPT" "$STATE_FILE" "$EVENTS_FILE" "$UI_PAUSE_FILE" "$DEV_PID_FILE" 2>/dev/null || true
  else
    rm -f "$DEV_PID_FILE" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'if [[ "$STOP_MSG_DONE" = "0" ]]; then STOP_MSG_DONE=1; echo >&2; ui_info "arrêt du mode dev"; fi; exit 130' INT TERM

require_node
cd "$ROOT_DIR"
: > "$EVENTS_FILE"
LAST_WORKER_RESTART_AT=0
resume_ui
export JWEBGEN_APP_NAME="$APP_NAME"
`;
