#!/usr/bin/env bash
set -euo pipefail

if [[ "${JWEBGEN_SHIM_TOMCAT_ACTIVE:-0}" == "1" && "${JWEBGEN_SHIM_HTTP_8080:-0}" == "1" && "${JWEBGEN_SHIM_APP_OK:-0}" == "0" ]]; then
  echo "⚠ Serveur actif mais application inaccessible sur /fixture/."
  exit 0
fi

if [[ "${JWEBGEN_SHIM_PORT_8080_LISTEN:-0}" == "1" ]]; then
  echo "ℹ Diagnostic: Port HTTP 8080 déjà occupé par un autre processus"
  exit 0
fi

echo "⚠ Tomcat indisponible au lancement."
echo "ℹ Diagnostic: Tomcat non actif"
exit 0

