# Somewhere Control 2.0 — operator visibility foundation

This milestone reuses the existing durable `TaskQueue`, approval gate, consumed-approval markers and emergency STOP. It does **not** create a second queue, start the paid AI provider, grant MCP write access, access production Docker or weaken the tunnel.

## Offline operator report

After the reviewed PR is merged, operators with authorised root access can run this with Node 22 installed on the host or via a separately reviewed, **read-only** Node container that can inspect the operator state directories:

```sh
node control/operations-cli.js
```

The CLI has no arguments and refuses non-root execution. It inspects:

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
