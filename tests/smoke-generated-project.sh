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

SCRIPTS="$TMP_ROOT/smokeapp/.jwebgen/scripts"
for f in build.mjs deploy.mjs dev.mjs watch.mjs; do
  [[ -f "$SCRIPTS/$f" ]] || fail "missing $f"
  node --check "$SCRIPTS/$f"
done

CFG="$TMP_ROOT/smokeapp/.jwebgen/.jwebgenrc"
printf '%s\n' 'export JWEBGEN_SERVER_TARGET="tomcat"' 'export JWEBGEN_HTTP_PORT="8099"' >"$CFG"

# --status only prints the app URL when a deployment path exists; use a fake TOMCAT_HOME under tmp.
FAKE_TOMCAT="$TMP_ROOT/fake-tomcat"
mkdir -p "$FAKE_TOMCAT/webapps/smokeapp"
touch "$FAKE_TOMCAT/webapps/smokeapp/.jwebgen-smoke"

echo "[smoke] jwebgen --status (expect configured target + port in URL)"
OUT="$(cd "$TMP_ROOT/smokeapp" && TOMCAT_HOME="$FAKE_TOMCAT" node "$ROOT_DIR/bin/jwebgen.js" --status 2>&1)" || true
echo "$OUT"
echo "$OUT" | grep -q 'Server: tomcat' || fail "status should show tomcat target"
echo "$OUT" | grep -q 'http://localhost:8099/' || fail "status URL should use JWEBGEN_HTTP_PORT"

echo "[smoke] generated project: OK"
