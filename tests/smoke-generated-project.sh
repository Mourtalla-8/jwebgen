#!/usr/bin/env bash
# Portable smoke: create a project, syntax-check Node entrypoints, exercise --status + HTTP port in URL.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { echo "FAIL: $1" >&2; exit 1; }

TMP_ROOT="$(node -e "process.stdout.write(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'jwebgen-gensmoke-')))")"
cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

echo "[smoke] create project in $TMP_ROOT"
(cd "$TMP_ROOT" && node "$ROOT_DIR/bin/jwebgen.js" --new smokeapp --yes)
[[ -d "$TMP_ROOT/smokeapp/.jwebgen/scripts" ]] || fail "missing generated scripts dir"

echo "[smoke] setup diagnostics in non-interactive mode"
set +e
SETUP_OUT="$(node "$ROOT_DIR/bin/jwebgen.js" --setup --dry-run 2>&1)"
SETUP_STATUS=$?
set -e
echo "$SETUP_OUT"
if [ "$SETUP_STATUS" -ne 0 ] && [ "$SETUP_STATUS" -ne 1 ]; then
  fail "--setup returned unexpected exit code: $SETUP_STATUS"
fi
echo "$SETUP_OUT" | grep -q "jwebgen setup diagnostics" || fail "--setup output missing diagnostics header"
echo "$SETUP_OUT" | grep -qE "Preflight (succeeded|failed)" || fail "--setup --dry-run output missing preflight result"
if echo "$SETUP_OUT" | grep -q "Run now for"; then
  fail "non-interactive setup should not prompt for confirmation"
fi

SCRIPTS="$TMP_ROOT/smokeapp/.jwebgen/scripts"
for f in build.mjs deploy.mjs dev.mjs watch.mjs add-servlet.mjs add-jsp.mjs; do
  [[ -f "$SCRIPTS/$f" ]] || fail "missing $f"
  node --check "$SCRIPTS/$f"
done

echo "[smoke] execute helper scripts (servlet/jsp)"
(cd "$TMP_ROOT/smokeapp" && node "$SCRIPTS/add-servlet.mjs" SmokeServlet)
[[ -f "$TMP_ROOT/smokeapp/src/main/java/com/exo/smokeapp/web/SmokeServlet.java" ]] || fail "add-servlet.mjs did not generate servlet"
(cd "$TMP_ROOT/smokeapp" && node "$SCRIPTS/add-jsp.mjs" smoke-page)
[[ -f "$TMP_ROOT/smokeapp/src/main/webapp/WEB-INF/jsp/smoke-page.jsp" ]] || fail "add-jsp.mjs did not generate jsp"

echo "[smoke] execute CLI variants for servlet/jsp normalization"
(cd "$TMP_ROOT/smokeapp" && node "$ROOT_DIR/bin/jwebgen.js" --servlet ApiServlet)
[[ -f "$TMP_ROOT/smokeapp/src/main/java/com/exo/smokeapp/web/ApiServlet.java" ]] || fail "--servlet ApiServlet should generate ApiServlet.java"
[[ ! -f "$TMP_ROOT/smokeapp/src/main/java/com/exo/smokeapp/web/ApiServletServlet.java" ]] || fail "--servlet should not duplicate Servlet suffix"
(cd "$TMP_ROOT/smokeapp" && node "$ROOT_DIR/bin/jwebgen.js" --jsp home.jsp)
[[ -f "$TMP_ROOT/smokeapp/src/main/webapp/WEB-INF/jsp/home.jsp" ]] || fail "--jsp home.jsp should generate single .jsp suffix"
[[ ! -f "$TMP_ROOT/smokeapp/src/main/webapp/WEB-INF/jsp/home.jsp.jsp" ]] || fail "--jsp should not duplicate .jsp suffix"

CFG="$TMP_ROOT/smokeapp/.jwebgen/.jwebgenrc"
printf '%s\n' 'export JWEBGEN_SERVER_TARGET="tomcat"' 'export JWEBGEN_HTTP_PORT="8099"' >"$CFG"

# --status only prints the app URL when deployment exists in a usable Tomcat layout.
FAKE_TOMCAT="$TMP_ROOT/fake-tomcat"
mkdir -p "$FAKE_TOMCAT/webapps/smokeapp" "$FAKE_TOMCAT/lib" "$FAKE_TOMCAT/bin"
touch "$FAKE_TOMCAT/webapps/smokeapp/.jwebgen-smoke"
touch "$FAKE_TOMCAT/lib/catalina.jar" "$FAKE_TOMCAT/bin/bootstrap.jar"
printf '%s\n' '#!/bin/sh' 'exit 0' >"$FAKE_TOMCAT/bin/catalina.sh"
chmod +x "$FAKE_TOMCAT/bin/catalina.sh"
printf '%s\n' '@echo off' 'exit /b 0' >"$FAKE_TOMCAT/bin/catalina.bat"

echo "[smoke] jwebgen --status (expect configured target + port in URL)"
set +e
OUT="$(cd "$TMP_ROOT/smokeapp" && TOMCAT_HOME="$FAKE_TOMCAT" node "$ROOT_DIR/bin/jwebgen.js" --status 2>&1)"
status_out=$?
set -e
echo "$OUT"
if [ "$status_out" -ne 0 ]; then
  echo "FAIL: jwebgen --status exited with code $status_out (output above)" >&2
  exit "$status_out"
fi
echo "$OUT" | grep -q 'Server: tomcat' || fail "status should show tomcat target"
echo "$OUT" | grep -q 'http://localhost:8099/' || fail "status URL should use JWEBGEN_HTTP_PORT"

echo "[smoke] generated project: OK"
