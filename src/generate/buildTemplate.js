export function makeBuildScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JWEBGEN_VERBOSE="\${JWEBGEN_VERBOSE:-0}"
MVN_COMMON_ARGS=(-DskipTests)

if [[ "$JWEBGEN_VERBOSE" != "1" ]]; then
  MVN_COMMON_ARGS=(-B -ntp "\${MVN_COMMON_ARGS[@]}")
fi

cd "$ROOT_DIR"
if [[ "\${JWEBGEN_DEV:-0}" = "1" ]]; then
  # En dev, éviter "clean" pour garder l'incrémental (beaucoup plus rapide).
  mvn "\${MVN_COMMON_ARGS[@]}" package
else
  mvn clean "\${MVN_COMMON_ARGS[@]}" package
fi
`;
}
