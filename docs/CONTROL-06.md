# Somewhere Control 0.6 — durable reservations and manual recovery

This release deliberately does **not** activate unattended AI calls or coding.

## Usage ledger

`control/usage-ledger.js` uses an exclusive local lock file, atomic JSON replacement, conservative non-refundable worst-case cost reservations and daily/monthly call counters. It refuses API calls on corrupt ledger content, stale lock files, or unresolved reservations crossing a billing month. This is appropriate for a single-machine prototype only: no automatic recovery of stale locks or unsettled provider operations.

**Caution:** This is a reservation policy, not a guaranteed billing cap. It has not been integrated with API requests, and costs must be verified with the provider. Do not activate unattended API calls until the real worker uses this ledger in the same transaction boundary and provider-side limits are configured.

## Task crash recovery

`control/recovery-cli.js inspect` lists reserved tasks without executing them. `fail-abandoned` requires an emergency STOP file and an explicit operator acknowledgment that all worker processes have stopped; it marks tasks failed rather than retrying a potentially duplicated operation. See `test/recovery.test.js`.

## Safe test staging

Our current production checkout is owned by the unprivileged `somewhere-agent`, whose private home cannot be traversed by arbitrary UIDs. The next runner revision should **stage an allowlisted file copy** into a disposable container with a separate test UID and no credentials, production mounts, network or Docker socket. The operator must verify the Docker host's security configuration; Docker container isolation is not a strong hostile-code sandbox by itself.

## Deployment policy

The Github App broker and proposal publisher remain operator-controlled. There is no public endpoint or new background daemon. Existing `/var/lib/somewhere-agent/state/STOP` must remain engaged. No production services need updating for this release.
