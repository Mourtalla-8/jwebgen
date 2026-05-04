#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { echo "FAIL: $1" >&2; exit 1; }

mktemp_mjs() {
  # GNU mktemp supports --suffix; BSD mktemp (macOS) requires XXXXXX at the end.
  # Keep the resulting filename ending with .mjs so `node --check` treats it as ESM.
  local tmpdir="${TMPDIR:-/tmp}"
  if mktemp --version >/dev/null 2>&1; then
    mktemp --suffix=.mjs "${tmpdir%/}/jwebgen.XXXXXX"
    return 0
  fi
  local base
  base="$(mktemp -t jwebgen.XXXXXX)"
  mv "$base" "$base.mjs"
  printf '%s\n' "$base.mjs"
}

echo "[golden] ensure fixtures exist (tests/fixtures-current)"
[[ -d "tests/fixtures-current/tomcat/.jwebgen/scripts" ]] || fail "missing tests/fixtures-current/tomcat/.jwebgen/scripts"
[[ -d "tests/fixtures-current/wildfly/.jwebgen/scripts" ]] || fail "missing tests/fixtures-current/wildfly/.jwebgen/scripts"

for env in tomcat wildfly; do
  echo "[golden] syntax checks for $env fixture"
  bash -n "tests/fixtures-current/$env/.jwebgen/scripts/build.sh"
  bash -n "tests/fixtures-current/$env/.jwebgen/scripts/deploy.sh"
  bash -n "tests/fixtures-current/$env/.jwebgen/scripts/dev.sh"
  bash -n "tests/fixtures-current/$env/.jwebgen/scripts/watch.sh"

  worker_tmp="$(mktemp_mjs)"
  dashboard_tmp="$(mktemp_mjs)"
  awk '
    /cat > "\$WORKER_SCRIPT" <<'\''EOF'\''/ { in_worker=1; next }
    /cat > "\$DASHBOARD_SCRIPT" <<'\''EOF'\''/ { in_worker=0; in_dashboard=1; next }
    /^EOF$/ { if (in_dashboard) { in_dashboard=0; next } if (in_worker) { in_worker=0; next } }
    in_worker { print }
  ' "tests/fixtures-current/$env/.jwebgen/scripts/watch.sh" > "$worker_tmp"
  awk '
    /cat > "\$DASHBOARD_SCRIPT" <<'\''EOF'\''/ { in_dashboard=1; next }
    /^EOF$/ { if (in_dashboard) { in_dashboard=0; next } }
    in_dashboard { print }
  ' "tests/fixtures-current/$env/.jwebgen/scripts/watch.sh" > "$dashboard_tmp"
  node --check "$worker_tmp"
  node --check "$dashboard_tmp"
  rm -f "$worker_tmp" "$dashboard_tmp"
done

echo "Golden fixtures: OK"

