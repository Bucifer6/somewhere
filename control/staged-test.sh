#!/usr/bin/env bash
# Operator-only staged tests. No source checkout, secrets or agent state are
# writable or mounted in the test container. NOT a hostile-code isolation guarantee.
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as operator/root; sandbox setup requires Docker" >&2
  exit 2
fi
SOURCE="${1:-/var/lib/somewhere-agent/workspace/somewhere}"
if [[ ! -d "$SOURCE/.git" ]]; then
  echo "Not a Git checkout: $SOURCE" >&2
  exit 2
fi
if [[ -n "$(git -C "$SOURCE" status --porcelain)" ]]; then
  echo "Refusing dirty checkout" >&2
  exit 2
fi
STAGING="$(mktemp -d /tmp/somewhere-verify.XXXXXXXX)"
cleanup() { rm -rf -- "$STAGING"; }
trap cleanup EXIT
# git archive omits all untracked files, local keys, .env and agent state.
git -C "$SOURCE" archive HEAD | tar -x -C "$STAGING"
chown -R 65534:65534 "$STAGING"
chmod 0700 "$STAGING"
# Only the staged copy is mounted, never the private checkout or host state.
docker run --rm \
  --network none \
  --user 65534:65534 \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 3g \
  --cpus 2 \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m,mode=1777 \
  -v "$STAGING:/app:ro" \
  -w /app \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  node:22-alpine node --test
