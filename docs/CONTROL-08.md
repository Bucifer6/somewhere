# Somewhere Control 0.8 — supervised offline rehearsal

This milestone adds a concrete, testable way to inspect and rehearse the next queued development task **without enabling paid APIs** or touching real task state.

## Commands

The agent's code must be updated to this release, then run as the unprivileged `somewhere-agent` identity from a Node.js 22+ environment with a **private, writable temporary directory**.

- `node control/supervisor-cli.js preview` shows the queued task and STOP state.
- `node control/supervisor-cli.js rehearse` requires the emergency STOP file, creates a scratch queue/ledger, runs a deterministic fake planning provider, reports the preview, and deletes scratch state.
- Both commands are offline. Neither accepts a model key, opens an HTTP listener, publishes to GitHub, runs arbitrary code, or modifies the real task queue.

The existing STOP file at `/var/lib/somewhere-agent/state/STOP` must **remain engaged**.

## Example Docker rehearsal (operator run)

```sh
docker run --rm \
  --user 998:998 --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m,mode=1777 \
  -e SOMEWHERE_AGENT_HOME=/agent -e TMPDIR=/tmp \
  -v /var/lib/somewhere-agent:/agent \
  -v /var/lib/somewhere-agent/workspace/somewhere:/app:ro \
  -w /app node:22-alpine node control/supervisor-cli.js rehearse
```

The container uses the agent's UID because the host's private home directories are not traversable by an arbitrary account. This rehearsal executes only trusted repository code. It is **not** a sandbox for adversarial code.

## Why no real AI call yet?

- An estimated budget ledger is not a provider-enforced monetary ceiling.
- Real API credentials must remain outside Git and process logs.
- The scheduler's command-line entry point still rejects enabled paid execution.
- No autonomous coding or GitHub posting occurs as a side effect of this version.
- No VPS service restarts, credential changes or port openings are required.

The next stage can introduce a supervised, manually approved single paid call only after an account-level spend limit, restricted credential handling, audited operation and provider usage reconciliation are verified.
