# Somewhere Control 2.0 — operator visibility foundation

This milestone reuses the existing durable `TaskQueue`, approval gate, consumed-approval markers and emergency STOP. It does **not** create a second queue, start the paid AI provider, grant MCP write access, access production Docker or weaken the tunnel.

## Offline operator report

After the reviewed PR is merged, run the command under root on a suitably privileged host **or**, preferably for the Docker deployment, under the real unprivileged owner of `/var/lib/somewhere-agent/state`. This avoids bypassing directory access checks. The report checks the effective UID against the mounted state directory owner before reading files:

```sh
node control/operations-cli.js
```

The CLI has no arguments and refuses identities other than root or the owner of the mounted private agent state directory. It also rejects directories writable by others. It inspects:

- the real STOP file at `/var/lib/somewhere-agent/state/STOP`, including fail-closed missing/invalid states
- task metadata by existing queue state: queued, reserved, completed, failed (up to 20 IDs per state; no task prompts)
- count of root-private approval records in `/root/somewhere-approvals` (never the approvals, fingerprints or credentials)
- loopback world health from `127.0.0.1:3000`

It **does not** mutate the queue, create approval records or consume approval tokens. No arbitrary paths or URLs are accepted at the CLI. Missing, malformed or insecure task directories are reported as unavailable, not silently treated as empty.

The report **never** declares a deployment verified solely from an HTTP health check. Real deployment verification additionally needs a recorded deployed commit or immutable image digest, validated health and a rollback rehearsal.

## Secure separation

This command is **not** exposed through `somewhere-control` or the OpenAI tunnel. The existing control container is intentionally limited to a read-only source bind mount and must not be granted access to agent state or `/root/somewhere-approvals` just to make status available remotely.

ChatGPT may continue to use five read-only Somewhere MCP tools. The STOP and paid execution state must be checked from the privileged operator environment, not inferred from those tools.

## Next milestones and approval requirements

Before permitting any ChatGPT-initiated queue mutation, introduce a separate minimal operations service with independent user authentication and request identity, role-based tool grants, CSRF/replay protection, durable approvals bound to exact task/operation digest and expiry, append-only audit, rate limits and a server-side STOP check. Root-owned approval bundles must never be minted or consumed solely on the basis of a shared MCP bearer token or natural-language chat confirmation.

Controlled deployment requires a separately scoped deploy identity, signed/approved revision selection, independent CI checks, immutable image references, backup, health probes, rollback and audit; it must be unable to reach the persistent world volume except through deliberately authorised migration paths.

No agent scheduling, paid AI calls, autonomous execution, deployment, GitHub writes or STOP overrides are enabled by this milestone.

## Tests

Run `npm test`; tests include normal reporting, fail-closed STOP, malformed private task data, insecure directory permissions, URL allowlisting and unavailable health reporting.

## Capability-dropped Docker invocation (preferred)

The previous `--cap-drop ALL` root container was unable to traverse the private agent directories: a Docker UID 0 process is not magically authorized to bypass filesystem DAC checks after capabilities are dropped. A reported `unavailable-fail-closed` STOP state means **not observable**, not absent.

Use the dedicated agent's numeric account identity, without granting Linux capabilities. The source and state are mounted read-only. The root-private approval directory is deliberately **not mounted** and its report entry is expected to remain unavailable. No approval data is needed to verify STOP and the task queue.

```sh
cd /opt/somewhere/source
umask 022
# Ensure the source code is readable by the dedicated agent before running:
# verify with: namei -l /opt/somewhere/source/control/operations-cli.js

docker run --rm \
  --user "$(id -u somewhere-agent):$(id -g somewhere-agent)" \
  --network host \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount type=bind,src=/opt/somewhere/source,dst=/app,readonly \
  --mount type=bind,src=/var/lib/somewhere-agent/state,dst=/var/lib/somewhere-agent/state,readonly \
  --workdir /app \
  --entrypoint node \
  node:22-alpine \
  control/operations-cli.js
```

If the queue is still inaccessible, inspect ownership and path permissions with `namei -l`, and confirm the relevant directories are actually owned by `somewhere-agent`. Do **not** run recursive `chmod`, loosen task/STOP permissions, add `CAP_DAC_OVERRIDE`, or mount root secrets. Never treat an unavailable state report as a green security check.
