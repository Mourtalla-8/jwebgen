export const WATCH_REMEDIATION_SECTION = `needs_server_start() {
  [[ "$DETECT_REASON" =~ (is\ not\ running|stopped|inactive|not\ detected) ]]
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

wait_for_worker_cycle() {
  local timeout_sec="\${1:-40}"
  local deadline=$((SECONDS + timeout_sec))
  local build_state=""
  local deploy_state=""
  local seen_running=0
  while (( SECONDS < deadline )); do
    if [[ ! -f "$STATE_FILE" ]]; then
      sleep 1
      continue
    fi
    build_state="$(sed -n 's/.*"build":"\\([^"]*\\)".*/\\1/p' "$STATE_FILE" 2>/dev/null | tail -n 1)"
    deploy_state="$(sed -n 's/.*"deploy":"\\([^"]*\\)".*/\\1/p' "$STATE_FILE" 2>/dev/null | tail -n 1)"
    if [[ "$build_state" = "running" || "$deploy_state" = "running" ]]; then
      seen_running=1
    fi
    if [[ "$seen_running" = "1" && "$build_state" != "running" && "$deploy_state" != "running" ]]; then
      return 0
    fi
    sleep 1
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
  local cfg="$ROOT_DIR/.jwebgen/.jwebgenrc"
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
  local proxy_hint="\${JWEBGEN_PROXY_PORT:-8081}"
  for candidate in 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090; do
    if [[ "$candidate" = "$proxy_hint" ]]; then
      continue
    fi
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
        ui_info "HTTP port changed and validated: $old_port -> $candidate"
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
  ui_warn "Unable to validate an HTTP port fallback."
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
  if [[ "$DETECT_REASON" == *"returns HTTP"* ]]; then
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
  local options="[f]refresh / [a]help / [q]uit"
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
    ui_warn "Non-interactive mode: unable to open /dev/tty for prompt."
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
      printf "\\n--- %s remediation ---\\n" "$(server_label)" >&$TTY_OUT_FD
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
      primary_key="s"
      primary_label="start"
    elif [[ "$SERVER_TARGET" = "wildfly" && "$DETECT_REASON" == *"HTTP 000"* ]]; then
      wildfly_http000=1
      start_needed=1
      primary_key="s"
      primary_label="restart"
    fi
    if [[ "$primary_key" = "f" ]]; then
      options="[f]refresh / [a]help / [q]uit"
    else
      options="[\${primary_key}]\${primary_label} / [f]refresh / [a]help / [q]uit"
    fi
    if [[ -n "$DETECT_CONFLICT_PORT" ]]; then
      has_conflict=1
      if [[ "$start_needed" = "1" ]]; then
        options="[\${primary_key}]\${primary_label} / [f]refresh / [a]help / [q]uit"
      elif [[ -n "$DETECT_OWNER_PID" ]]; then
        has_pid_conflict=1
        options="[k]ill owner / [v]stop service / [f]refresh / [a]help / [q]uit"
      else
        options="[i]nspect / [x]kill port / [f]refresh / [a]help / [q]uit"
      fi
    elif [[ "$DETECT_REASON" == *"returns HTTP"* ]]; then
      app_down_like=1
      if [[ "$wildfly_http000" = "1" ]]; then
        options="[r]edeploy+restart / [i]nspect / [f]refresh / [a]help / [q]uit"
      else
        options="[r]edeploy / [i]nspect / [f]refresh / [a]help / [q]uit"
      fi
    fi
    if [[ -n "$DETECT_REASON" && "$DETECT_REASON" != "$last_reason_shown" ]]; then
      cause_label="$(compact_cause_label)"
      ui_warn "Cause: $cause_label"
      ui_info "Why: $DETECT_REASON"
      last_reason_shown="$DETECT_REASON"
    fi
    prompt_subject="$(server_label) unavailable"
    if [[ "$DETECT_REASON" == *"returns HTTP"* ]]; then
      prompt_subject="Application unreachable (/$APP_NAME/)"
    fi
    printf "\\n%s. %s ? " "$prompt_subject" "$options" >&$TTY_OUT_FD
    IFS= read -rsn1 answer <&$TTY_IN_FD || { resume_ui; start_dashboard; return 1; }
    if [[ "$answer" == $'\\e' ]]; then
      IFS= read -rsn2 -t 0.02 discard <&$TTY_IN_FD || true
      continue
    fi
    printf "\\n" >&$TTY_OUT_FD
    case "$answer" in
      [Kk])
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" != "1" ]]; then
          ui_warn "Option is not available in this menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_CONFLICT_PORT" ]]; then
          ui_warn "No port conflict detected right now."
          continue
        fi
        if [[ -z "$DETECT_OWNER_PID" ]]; then
          ui_warn "PID not identified for port $DETECT_CONFLICT_PORT."
          ui_info "Inspect with: ss -lntp | rg ':$DETECT_CONFLICT_PORT'"
          continue
        fi
        if [[ -f "$STATE_FILE" ]]; then
          if ! rg -q "\"pid\"\\s*:\\s*\${DETECT_OWNER_PID}" "$STATE_FILE" 2>/dev/null; then
            ui_warn "Denied: this PID does not belong to jwebgen (safety)."
            ui_info "Stop it manually if you are sure, or use another port."
            continue
          fi
        else
          ui_warn "Denied: jwebgen state is missing, unable to verify PID ownership."
          continue
        fi
        printf "\\nConfirm stopping PID %s on port %s? [y/N] " "$DETECT_OWNER_PID" "$DETECT_CONFLICT_PORT" >&$TTY_OUT_FD
        IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation cancelled."; continue; }
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
          local killed_ok=0
          if kill "$DETECT_OWNER_PID" 2>/dev/null; then
            ui_info "Process $DETECT_OWNER_PID stopped."
            killed_ok=1
          elif sudo -n kill "$DETECT_OWNER_PID" 2>/dev/null; then
            ui_info "Process $DETECT_OWNER_PID stopped with sudo."
            killed_ok=1
          else
            printf "\\nRoot permission required to stop %s. Authenticate sudo now? [y/N] " "$DETECT_OWNER_PID" >&$TTY_OUT_FD
            IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation cancelled."; continue; }
            if [[ "$confirm" =~ ^[Yy]$ ]] && sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD && sudo kill "$DETECT_OWNER_PID" 2>/dev/null; then
              ui_info "Process $DETECT_OWNER_PID stopped with sudo."
              killed_ok=1
            else
              ui_err "Unable to stop process $DETECT_OWNER_PID."
            fi
          fi
          if [[ "$killed_ok" = "1" ]]; then
          if ! wait_for_port_release "$DETECT_CONFLICT_PORT"; then
            detect_server_state
            ui_warn "Port $DETECT_CONFLICT_PORT is being reclaimed automatically."
            if [[ -n "$DETECT_OWNER" ]]; then
              ui_info "New owner process: $DETECT_OWNER"
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
          ui_info "Stop cancelled."
        fi
        ;;
      [Ii])
        if [[ "$app_down_like" = "1" ]]; then
          printf "\\nQuick inspection %s:\\n" "$(server_label)" >&$TTY_OUT_FD
          if [[ "$SERVER_TARGET" = "wildfly" ]]; then
            ui_info "Check: ls -la \${WILDFLY_DEPLOYMENTS:-\${WILDFLY_HOME:-/opt/wildfly}/standalone/deployments} | rg '$APP_NAME|failed|deployed'"
            ui_info "Check: journalctl -u wildfly -n 120"
          else
            ui_info "Check: ls -la \${TOMCAT10:-/var/lib/tomcat10}/webapps | rg '$APP_NAME'"
            ui_info "Check: journalctl -u $(server_unit_name) -n 120"
          fi
          ui_info "Then press [r] to redeploy or [f] to refresh."
          continue
        fi
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" = "1" ]]; then
          ui_warn "Option is not available in this menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_CONFLICT_PORT" ]]; then
          ui_warn "No port conflict detected right now."
          continue
        fi
        if [[ -n "$DETECT_OWNER" ]]; then
          ui_info "Current owner: $DETECT_OWNER"
        else
          ui_warn "Owner is still not identified for port $DETECT_CONFLICT_PORT."
        fi
        ;;
      [Xx])
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" = "1" ]]; then
          ui_warn "Option is not available in this menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_CONFLICT_PORT" ]]; then
          ui_warn "No port conflict detected right now."
          continue
        fi
        printf "\\nConfirm killing port %s with fuser -k? [y/N] " "$DETECT_CONFLICT_PORT" >&$TTY_OUT_FD
        IFS= read -r force_kill_confirm <&$TTY_IN_FD || { ui_warn "Confirmation cancelled."; continue; }
        if [[ ! "$force_kill_confirm" =~ ^[Yy]$ ]]; then
          ui_info "Kill port cancelled."
          continue
        fi
        local killed_port_ok=0
        if fuser -k -n tcp "$DETECT_CONFLICT_PORT" >/dev/null 2>&1; then
          ui_info "Port $DETECT_CONFLICT_PORT released."
          killed_port_ok=1
        elif sudo -n fuser -k -n tcp "$DETECT_CONFLICT_PORT" >/dev/null 2>&1; then
          ui_info "Port $DETECT_CONFLICT_PORT released with sudo."
          killed_port_ok=1
        else
          printf "\\nRoot permission required to release port %s. Authenticate sudo now? [y/N] " "$DETECT_CONFLICT_PORT" >&$TTY_OUT_FD
          IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation cancelled."; continue; }
          if [[ "$confirm" =~ ^[Yy]$ ]] && sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD && sudo fuser -k -n tcp "$DETECT_CONFLICT_PORT" >/dev/null 2>&1; then
            ui_info "Port $DETECT_CONFLICT_PORT released with sudo."
            killed_port_ok=1
          else
            ui_err "Unable to release port $DETECT_CONFLICT_PORT."
            ui_info "Try: sudo fuser -k -n tcp $DETECT_CONFLICT_PORT"
          fi
        fi
        if [[ "$killed_port_ok" = "1" ]]; then
          if ! wait_for_port_release "$DETECT_CONFLICT_PORT"; then
            detect_server_state
            ui_warn "Port $DETECT_CONFLICT_PORT is being reclaimed automatically."
            if [[ -n "$DETECT_OWNER" ]]; then
              ui_info "New owner process: $DETECT_OWNER"
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
      [Vv])
        if [[ "$has_conflict" != "1" || "$has_pid_conflict" != "1" ]]; then
          ui_warn "Option is not available in this menu."
          continue
        fi
        detect_server_state
        if [[ -z "$DETECT_OWNER_PID" ]]; then
          ui_warn "Owner PID not found."
          continue
        fi
        conflict_unit="$(owner_systemd_unit_from_pid "$DETECT_OWNER_PID" || true)"
        if [[ -z "$conflict_unit" ]]; then
          ui_warn "Unable to identify a systemd service for this PID."
          if [[ -n "$DETECT_OWNER" ]]; then
            ui_info "Owner: $DETECT_OWNER"
          fi
          continue
        fi
        if [[ "$conflict_unit" = "$(server_unit_name).service" || "$conflict_unit" = "$(server_unit_name)" ]]; then
          ui_warn "Detected service is the target server itself: $conflict_unit"
          continue
        fi
        printf "\\nConfirm stopping service %s? [y/N] " "$conflict_unit" >&$TTY_OUT_FD
        IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation cancelled."; continue; }
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
          ui_info "Service stop cancelled."
          continue
        fi
        if ! sudo -n systemctl stop "$conflict_unit" 2>/dev/null; then
          printf "\\nRoot permission required to stop %s. Authenticate sudo now? [y/N] " "$conflict_unit" >&$TTY_OUT_FD
          IFS= read -r confirm <&$TTY_IN_FD || { ui_warn "Confirmation cancelled."; continue; }
          if [[ ! "$confirm" =~ ^[Yy]$ ]] || ! sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD || ! sudo systemctl stop "$conflict_unit" 2>/dev/null; then
            ui_err "Unable to stop $conflict_unit."
            ui_info "Command: sudo systemctl stop $conflict_unit"
            continue
          fi
        fi
        ui_info "Service stopped: $conflict_unit"
        if ! wait_for_port_release "$DETECT_CONFLICT_PORT"; then
          detect_server_state
          ui_warn "Port remains busy after stopping $conflict_unit."
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
      [Ff])
        printf "\\n" >&$TTY_OUT_FD
        restart_worker
        detect_server_state
        if [[ "$DETECT_STATUS" = "up" ]]; then
          resume_ui
          start_dashboard
          return 0
        fi
        ui_warn "Still unreachable after refresh."
        ;;
      [Rr])
        if [[ "$app_down_like" != "1" ]]; then
          ui_warn "Option is not available in this menu."
          continue
        fi
        if [[ "$wildfly_http000" = "1" ]]; then
          ui_info "Trying redeploy + server restart..."
          printf "\\nSudo authentication is required...\\n" >&$TTY_OUT_FD
          if ! sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD; then
            ui_err "Sudo authentication failed."
            continue
          fi
          if ! start_server_noninteractive 1; then
            ui_err "Automatic restart failed."
            show_server_help
            continue
          fi
        else
          ui_info "Trying quick redeploy..."
        fi
        ui_info "Redeploy in progress..."
        restart_worker
        if ! wait_for_worker_cycle 50; then
          ui_warn "Redeploy is taking longer than expected."
        fi
        detect_server_state
        if [[ "$DETECT_STATUS" = "up" ]]; then
          resume_ui
          start_dashboard
          return 0
        fi
        ui_warn "Application still unreachable after redeploy."
        continue
        ;;
      [Ss])
        if [[ "$start_needed" = "1" ]]; then
          if [[ "$SERVER_TARGET" = "wildfly" ]]; then
            local wf_load
            wf_load="$(systemctl show wildfly -p LoadState --value 2>/dev/null || echo not-found)"
            if [[ "$wf_load" != "not-found" ]]; then
              true
            elif [[ -n "\${WILDFLY_HOME:-}" && -x "\${WILDFLY_HOME}/bin/standalone.sh" ]]; then
              ui_warn "WildFly detected via WILDFLY_HOME, but automatic restart uses systemd."
              ui_info "Start manually: \${WILDFLY_HOME}/bin/standalone.sh -b 0.0.0.0"
              continue
            else
              ui_warn "WildFly not detected: automatic restart is unavailable."
              show_server_help
              continue
            fi
          fi

          printf "\\nSudo authentication is required...\\n" >&$TTY_OUT_FD
          if ! sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD; then
            ui_err "Sudo authentication failed."
            continue
          fi
          if start_server_noninteractive "$wildfly_http000"; then
            restart_worker
            resume_ui
            start_dashboard
            return 0
          fi
          ui_err "Automatic start failed."
          show_server_help
          continue
        fi
        ui_warn "Option is not available in this menu."
        ;;
      [Aa])
        printf "\\n--- Help %s ---\\n" "$(server_label)" >&$TTY_OUT_FD
        show_server_help
        ;;
      [Qq])
        resume_ui
        return 1
        ;;
      *)
        ui_warn "Option is not available in this menu."
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
    ui_warn "Non-interactive mode: unable to open /dev/tty for prompt."
    show_deploy_help
    resume_ui
    start_dashboard
    return 1
  fi
  printf "\\n--- Deployment remediation ---\\n" >&$TTY_OUT_FD
  while true; do
    printf "\\nDeployment failed. [f]refresh / [a]help / [q]uit ? " >&$TTY_OUT_FD
    IFS= read -rsn1 answer <&$TTY_IN_FD || { resume_ui; start_dashboard; return 1; }
    if [[ "$answer" == $'\\e' ]]; then
      IFS= read -rsn2 -t 0.02 discard <&$TTY_IN_FD || true
      continue
    fi
    printf "\\n" >&$TTY_OUT_FD
    case "$answer" in
      [Ff])
        restart_worker
        resume_ui
        start_dashboard
        return 0
        ;;
      [Aa])
        printf "\\n--- Deployment help ---\\n" >&$TTY_OUT_FD
        show_deploy_help
        ;;
      [Qq])
        resume_ui
        start_dashboard
        return 1
        ;;
      *)
        ui_warn "Option is not available in this menu."
        ;;
    esac
  done
}

manual_refresh() {
  ui_info "Manual refresh: revalidating dev state..."
  detect_server_state
  restart_worker
  if [[ "$DETECT_STATUS" = "up" ]]; then
    ui_info "State OK: $(server_label) and application are reachable."
    return 0
  fi
  ui_warn "Refresh: anomaly detected after revalidation."
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
    return 0
  fi
  case "$answer" in
    [Ff])
      printf "\\n" >&$TTY_OUT_FD
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
            ui_warn "LiveReload port busy: \${ev_port:-$LIVE_PORT}"
            if [[ -n "$ev_owner" ]]; then
              ui_info "Occupant: $ev_owner"
            fi
          elif [[ "$line" == *'"type":"live_port_fallback"'* ]]; then
            ev_from="$(printf '%s' "$line" | sed -n 's/.*"fromPort":\\([0-9][0-9]*\\).*/\\1/p')"
            ev_to="$(printf '%s' "$line" | sed -n 's/.*"toPort":\\([0-9][0-9]*\\).*/\\1/p')"
            ui_info "LiveReload: automatic fallback \${ev_from:-$LIVE_PORT} -> \${ev_to:-unknown}"
          elif [[ "$line" == *'"type":"app_unreachable"'* ]]; then
            ui_warn "Server is running but application is unreachable on /$APP_NAME/."
            ui_info "Check deployment, then run [f]refresh if needed."
          elif [[ "$line" == *'"type":"deploy_sudo_required"'* ]]; then
            now_ts="$(date +%s 2>/dev/null || echo 0)"
            if (( now_ts - last_deploy_sudo_ts < 8 )); then
              continue
            fi
            last_deploy_sudo_ts="$now_ts"
            pause_ui
            stop_dashboard
            printf "\nDeployment: insufficient permissions. Sudo authentication is required...\n" >&$TTY_OUT_FD
            if sudo -v <&$TTY_IN_FD 1>&$TTY_OUT_FD 2>&$TTY_OUT_FD; then
              restart_worker
              resume_ui
              start_dashboard
            else
              ui_err "Sudo authentication failed. Run sudo -v then refresh."
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
  local pid_in_file=""
  pid_in_file="$(tr -d '[:space:]' < "$DEV_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid_in_file" && "$pid_in_file" != "$$" ]]; then
    ui_info "Another dev session is active (PID $pid_in_file); skipping deploy cleanup and shared file removal."
    return 0
  fi
  if [[ -x "$ROOT_DIR/.jwebgen/scripts/deploy.sh" ]]; then
    local cleanup_output=""
    if ! cleanup_output="$("$ROOT_DIR/.jwebgen/scripts/deploy.sh" --cleanup-dev 2>&1)"; then
      if [[ "$cleanup_output" == *"__JWEBGEN_EVENT__ deploy_sudo_required"* ]]; then
        ui_warn "Automatic cleanup needs elevated privileges. jwebgen will auto-retry with sudo on Linux when available."
      else
        ui_warn "Automatic deployment cleanup failed (non-blocking). Try: jwebgen --clean --deploy"
      fi
      if [[ -n "$cleanup_output" ]]; then
        printf "%s\n" "$cleanup_output" >&2
      fi
    fi
  fi
  rm -f "$STATE_FILE" "$EVENTS_FILE" "$UI_PAUSE_FILE" "$DEV_PID_FILE" 2>/dev/null || true
}
trap cleanup EXIT
trap 'if [[ "$STOP_MSG_DONE" = "0" ]]; then STOP_MSG_DONE=1; echo >&2; ui_info "stopping dev mode"; fi; exit 130' INT TERM

require_node
cd "$ROOT_DIR"
: > "$EVENTS_FILE"
LAST_WORKER_RESTART_AT=0
resume_ui
export JWEBGEN_APP_NAME="$APP_NAME"
`;
