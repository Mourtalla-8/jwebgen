export const WATCH_PROBE_SECTION = `server_unit_name() {
  if [[ "$SERVER_TARGET" = "wildfly" ]]; then
    echo "wildfly"
  else
    if ! command -v systemctl >/dev/null 2>&1; then
      echo "tomcat10"
      return 0
    fi
    local c
    for c in tomcat10 tomcat; do
      systemctl status "$c" >/dev/null 2>&1
      case "$?" in
        0|3) echo "$c"; return 0 ;;
      esac
    done
    echo "tomcat10"
  fi
}
server_label() {
  if [[ "$SERVER_TARGET" = "wildfly" ]]; then
    echo "WildFly"
  else
    echo "Tomcat"
  fi
}

DETECT_STATUS="unknown"
DETECT_REASON=""
DETECT_ACTION=""
DETECT_OWNER=""
DETECT_OWNER_PID=""
DETECT_CONFLICT_PORT=""
DETECT_EFFECTIVE_URL=""
DETECT_EXPECTED_URL=""
port_owner_summary() {
  local port="$1"
  local line=""
  if command -v ss >/dev/null 2>&1; then
    line="$(ss -lntp 2>/dev/null | awk -v p=":$port" 'index($4,p) && $1=="LISTEN" {print; exit}')"
  fi
  if [[ -z "$line" ]] && command -v lsof >/dev/null 2>&1; then
    line="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sed -n '2p')"
  fi
  if [[ -n "$line" ]]; then
    echo "$line"
    return 0
  fi
  if command -v fuser >/dev/null 2>&1; then
    local pids
    pids="$(fuser -n tcp "$port" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//')"
    if [[ -n "$pids" ]]; then
      echo "pid=$pids"
      return 0
    fi
  fi
  return 1
}
extract_pid_from_owner() {
  local owner="$1"
  local pid=""
  pid="$(printf '%s' "$owner" | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | head -n 1)"
  if [[ -z "$pid" ]]; then
    pid="$(printf '%s' "$owner" | sed -n 's/.*users:((".*",pid=\\([0-9][0-9]*\\).*/\\1/p' | head -n 1)"
  fi
  if [[ -z "$pid" ]]; then
    pid="$(printf '%s' "$owner" | sed -n 's/^\\([^ ]*\\) .*$/\\1/p' | sed -n 's/[^0-9]*\\([0-9][0-9]*\\).*/\\1/p' | head -n 1)"
  fi
  printf '%s' "$pid"
}
is_port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lnt 2>/dev/null | awk -v p=":$port" 'index($4,p) && $1=="LISTEN" {found=1} END {exit !found}'
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$port" >/dev/null 2>&1
    return $?
  fi
  return 1
}
`;
