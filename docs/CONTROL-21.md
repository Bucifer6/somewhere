# Somewhere Control 2.1 — supervised local task intake

Control 2.1 adds an **offline, owner-only** preview/submit command using the EXISTING `TaskQueue` and a separate private append-only intake audit. It does not add write tools to the ChatGPT MCP connector.

## Security constraints

- The submitting process must run as the non-root numeric owner of the existing `/var/lib/somewhere-agent/state` directory.
- Queue and state directories must remain private (0700). The STOP marker must be a protected regular file owned by root or the agent user. A missing, inaccessible or invalid STOP prevents submission.
- Input is a bounded JSON object via stdin (not shell arguments): `{"type":"development-plan","prompt":"..."}` or `world-story-proposal`. Existing `validateTask` constraints apply (10–1500 characters).
- The operator first previews a SHA-256 digest, then supplies the full digest on a separate submit invocation, along with exactly the same input JSON. The digest is a **review confirmation**, not a secret, user authentication, execution approval or cryptographic signature.
- A private exclusive lock prevents concurrent submissions. A stale lock fails closed and requires manual operator inspection; do not force-delete it without checking for active writers.
- Each submission writes a durable audit *intent* before queue mutation, then writes an audit completion record. A crash between them requires reconciliation of the queued task and intent; no silent retry or automatic replay.
- The audit omits prompts and tokens; the queue retains the private prompt in mode 0600 as before. The audit is capped at 1 MiB so unattended unbounded growth fails closed.
- A queue may contain at most 20 queued tasks via this route.
- The new CLI does NOT create root approval records, reserve or execute tasks, call AI, remove STOP, use GitHub, control Docker or deploy anything.

## Example: preview and submit (operator action, not part of deployment)

First merge this release and update the VPS source checkout. Because the current VPS has Node 22 in Docker rather than on the host, use a **dedicated temporary container with exactly the agent UID**, mounting only the source read-only and the agent state read-write. Do not mount the production world volume, root approval directory, provider secrets, tunnel credentials or Docker socket.

Example workflow uses a local private request file. Create it securely under the agent-owned home with mode 0600 using your normal operator procedure, and pass the JSON through stdin. Do not place sensitive prompt text in terminal command-line history.

Preview (the state mount is read-only for this stage):

```sh
docker run --rm --user "$(id -u somewhere-agent):$(id -g somewhere-agent)" \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --mount type=bind,src=/opt/somewhere/source,dst=/app,readonly \
  --mount type=bind,src=/var/lib/somewhere-agent/state,dst=/var/lib/somewhere-agent/state,readonly \
  --workdir /app --entrypoint node -i node:22-alpine \
  control/task-intake-cli.js preview < /path/to/private-request.json
```

For submission, after independently reviewing the request and full digest, repeat with the state mount read-write and `submit SHA256`. The operator must not run submission during a STOP ownership/permission anomaly. The CLI verifies STOP is engaged again immediately before enqueue.

```sh
docker run --rm --user "$(id -u somewhere-agent):$(id -g somewhere-agent)" \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --mount type=bind,src=/opt/somewhere/source,dst=/app,readonly \
  --mount type=bind,src=/var/lib/somewhere-agent/state,dst=/var/lib/somewhere-agent/state \
  --workdir /app --entrypoint node -i node:22-alpine \
  control/task-intake-cli.js submit REVIEWED_SHA256 < /path/to/private-request.json
```

**Do not submit the existing queued development-plan task again.** This feature is for future, deliberately requested tasks and is off until an operator invokes the command. Existing task `f502b8fd-8f1c-4699-84e3-765859892db9` remains untouched.

## Deferred ChatGPT submission and approvals

The shared tunnel bearer token does not identify an individual operator or provide independent write authorization. Therefore, this milestone does not connect intake to MCP. Before creating a ChatGPT write tool, implement per-user identity, narrowly scoped write grants, request-bound one-time authorization with expiry and replay protection, trusted STOP enforcement, and durable audit separate from the MCP process.

The existing root-only 15-minute approval gate is **separate** from the task-intake digest; intake does not constitute approval to invoke a paid model or run a worker. Production deployments remain out of scope.
