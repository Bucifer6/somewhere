#!/usr/bin/env sh
# Operator-invoked, isolated test runner. Requires Docker on the operator host.
# Never mount production state, GitHub keys or Docker socket into the container.
set -eu
WORKSPACE="${1:-}"
if [ -z "$WORKSPACE" ] || [ ! -f "$WORKSPACE/package.json" ]; then
  echo "Usage: control/offline-test.sh /path/to/verified/somewhere/checkout" >&2
  exit 2
fi
# Treat the workspace as untrusted code and do not grant any network access.
docker run --rm \
  --network none \
  --user 65534:65534 \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 3g \
  --cpus 2 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
  -v "$WORKSPACE:/workspace:ro" \
  -w /workspace \
  node:22-alpine node --test
