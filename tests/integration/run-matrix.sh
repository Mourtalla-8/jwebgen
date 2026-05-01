#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SHIMS_DIR="$ROOT_DIR/tests/integration/shims"
FIXTURE_TOMCAT="$ROOT_DIR/tests/fixtures-current/tomcat"
FIXTURE_WILDFLY="$ROOT_DIR/tests/fixtures-current/wildfly"

run_case() {
  local name="$1"
  shift
  echo "[case] $name"
  ( "$@" ) || { echo "FAIL: $name" >&2; exit 1; }
}

assert_output_contains() {
  local needle="$1"
  local file="$2"
  if ! command -v rg >/dev/null 2>&1; then
    grep -F "$needle" "$file" >/dev/null
    return $?
  fi
  rg -F "$needle" "$file" >/dev/null
}

case_tomcat_down_noninteractive() {
  PATH="$SHIMS_DIR:$PATH" \
  JWEBGEN_SHIM_TOMCAT_ACTIVE=0 \
  JWEBGEN_SHIM_HTTP_8080=0 \
  JWEBGEN_SHIM_APP_OK=0 \
  bash -lc "cd \"$FIXTURE_TOMCAT\" && timeout 5 ./.jwebgen/scripts/watch.sh" >/tmp/jwebgen_case_out 2>&1 || true
  assert_output_contains "unavailable at startup" /tmp/jwebgen_case_out
}

case_tomcat_engine_up_app_down() {
  PATH="$SHIMS_DIR:$PATH" \
  JWEBGEN_SHIM_TOMCAT_ACTIVE=1 \
  JWEBGEN_SHIM_HTTP_8080=1 \
  JWEBGEN_SHIM_APP_OK=0 \
  bash -lc "cd \"$FIXTURE_TOMCAT\" && timeout 5 ./.jwebgen/scripts/watch.sh" >/tmp/jwebgen_case_out 2>&1 || true
  assert_output_contains "application is unreachable" /tmp/jwebgen_case_out
}

case_http_port_conflict() {
  PATH="$SHIMS_DIR:$PATH" \
  JWEBGEN_SHIM_TOMCAT_ACTIVE=0 \
  JWEBGEN_SHIM_HTTP_8080=0 \
  JWEBGEN_SHIM_PORT_8080_LISTEN=1 \
  bash -lc "cd \"$FIXTURE_TOMCAT\" && timeout 5 ./.jwebgen/scripts/watch.sh" >/tmp/jwebgen_case_out 2>&1 || true
  assert_output_contains "HTTP port 8080 is already in use" /tmp/jwebgen_case_out
}

case_wildfly_down() {
  PATH="$SHIMS_DIR:$PATH" \
  JWEBGEN_SHIM_WILDFLY_ACTIVE=0 \
  JWEBGEN_SHIM_WILDFLY_MGMT=0 \
  bash -lc "cd \"$FIXTURE_WILDFLY\" && JWEBGEN_SERVER_TARGET=wildfly timeout 5 ./.jwebgen/scripts/watch.sh" >/tmp/jwebgen_case_out 2>&1 || true
  assert_output_contains "WildFly unavailable at startup" /tmp/jwebgen_case_out
}

case_clean_deploy_flag_combo() {
  bash -lc "cd \"$FIXTURE_TOMCAT\" && node \"$ROOT_DIR/bin/jwebgen.js\" --clean --deploy" >/tmp/jwebgen_case_out 2>&1 || true
  if assert_output_contains "Only one main action is allowed" /tmp/jwebgen_case_out; then
    return 1
  fi
  return 0
}

chmod +x "$SHIMS_DIR/"{systemctl,curl,ss} 2>/dev/null || true
chmod +x "$ROOT_DIR/tests/integration/template-asserts.sh" 2>/dev/null || true

run_case "tomcat_down_noninteractive" case_tomcat_down_noninteractive
run_case "tomcat_engine_up_app_down" case_tomcat_engine_up_app_down
run_case "http_port_conflict" case_http_port_conflict
run_case "wildfly_down" case_wildfly_down
run_case "clean_deploy_flag_combo" case_clean_deploy_flag_combo
run_case "template_asserts" "$ROOT_DIR/tests/integration/template-asserts.sh"

echo "Integration matrix: OK"

