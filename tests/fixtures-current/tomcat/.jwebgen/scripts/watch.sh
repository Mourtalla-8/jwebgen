#!/usr/bin/env bash
set -euo pipefail

if [[ "${JWEBGEN_SHIM_TOMCAT_ACTIVE:-0}" == "1" && "${JWEBGEN_SHIM_HTTP_8080:-0}" == "1" && "${JWEBGEN_SHIM_APP_OK:-0}" == "0" ]]; then
  echo "⚠ Server is running but application is unreachable on /fixture/."
  exit 0
fi

if [[ "${JWEBGEN_SHIM_PORT_8080_LISTEN:-0}" == "1" ]]; then
  echo "ℹ Diagnostic: HTTP port 8080 is already in use by another process"
  exit 0
fi

echo "⚠ Tomcat unavailable at startup."
echo "ℹ Diagnostic: Tomcat is not running"
exit 0

