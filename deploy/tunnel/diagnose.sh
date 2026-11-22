#!/usr/bin/env bash
# Read-only prerequisites. Safe to run on the VPS; no secrets printed.
set -euo pipefail
printf 'Somewhere Secure MCP Tunnel prerequisites\n'
printf 'Local MCP listener: '
if curl -fsS --connect-timeout 2 --max-time 4 -o /dev/null \
  -w '%{http_code}' -X POST \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:3100/mcp | grep -qx '401'; then
  printf 'PASS (401 unauthenticated)\n'
else
  printf 'NOT VERIFIED (expected unauthenticated 401)\n'
fi
printf 'Emergency STOP: '
if [[ -f /var/lib/somewhere-agent/state/STOP ]]; then echo 'ENGAGED'; else echo 'WARNING: MISSING'; fi
printf 'Tunnel client binary: '
if command -v tunnel-client >/dev/null 2>&1; then
  tunnel-client --version
else
  echo 'NOT INSTALLED'
fi
printf 'Outbound HTTPS to OpenAI: '
if curl -sSIL --connect-timeout 4 --max-time 8 -o /dev/null https://api.openai.com; then
  echo 'REACHABLE'
else
  echo 'NOT VERIFIED'
fi
printf 'No secrets, services, firewall rules or files modified.\n'
