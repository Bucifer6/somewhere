# Somewhere Control 2.2 — private read-only operations bridge

## Purpose

Read the real agent STOP and queued/reserved/completed/failed task metadata from ChatGPT without mounting agent state, private approvals, Docker socket or production volumes in the MCP control container.

This phase has **no task submission, approval creation, billable calls, root shell, deployment execution or STOP override tools**. This is a deliberately conservative bridge for reading state only. All changes go through protected PR and CI.

## Architecture

```
ChatGPT / OpenAI tunnel
     │ authenticated MCP HTTP
     ▼
somewhere-control (127.0.0.1:3100, no agent state mounts)
     │ separate bearer token, GET /v1/status
     ▼
somewhere-operations (127.0.0.1:3101, agent UID)
     │ read-only state mount
     ▼
/var/lib/somewhere-agent/state (private, agent-owned)
```

The standalone `control/operations-http.js` listener runs under the unprivileged agent UID. Its only route is `GET /v1/status`. Requests require a distinct random bearer token, checked in constant time. It rejects Origin headers, POST, query strings, redirects, and non-loopback binds, and rate-limits authenticated reads.

The response contains STOP state, queued/reserved/completed/failed counts and up to 20 task IDs/type/state/attempts/updatedAt per group, plus world health. It does NOT include task prompts, root approval bundles, credentials, world inhabitants or filesystem paths. A health check cannot prove deployment readiness. Missing or inaccessible private state is marked `unavailable-fail-closed`, never falsely empty/healthy.

The MCP tool `somewhere_operations_status` is **optional** and only appears if BOTH `SOMEWHERE_OPERATIONS_URL=http://127.0.0.1:3101/v1/status` and `SOMEWHERE_OPERATIONS_KEY_FILE=/run/secrets/somewhere-operations-token` are explicitly set in the control environment. If neither is set, existing five tools remain unchanged. Partial or unexpected configurations fail closed at startup.

Both the operations server and MCP client validate the private token file; two private copies of the same dedicated bridge token with ownership matching the corresponding unprivileged runtime may be needed. NEVER commit this secret, put it in the shell command line, expose it in Docker environment variables, or use the OpenAI tunnel runtime key as the operations bridge key.

## Review gates before live activation

1. Verify `npm test` and the exact merged commit in CI.
2. Verify actual control container UID, agent UID, state ownership, container network, and Docker secret-mount handling before deploying. **Do not assume the control container runs as root or the agent.**
3. Provision the distinct bridge secret under strictly owner-only files for each process. Ensure secrets are never readable by other users. Never grant the MCP container access to the agent state or `/root/somewhere-approvals`.
4. Install the standalone operations service with only its agent-state mount read-only, its own secret-file mount read-only, `--user` set to the agent's numeric UID/GID, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, and loopback-only network binding. Use a reviewed supervisor policy and log rotation. Test `401` without the token; then test the authenticated projection locally without printing the token.
5. Only then recreate the MCP control service with its own **separate bridge token file** and the two exact config variables. Preserve the existing control MCP bearer token, localhost bind, source mount and tunnel authorization. Test advertised tools and audit output. Roll back by removing the optional bridge configuration from the control container and restarting the previous known-good process.
6. Refresh Somewhere plugin tool discovery in ChatGPT and verify `somewhere_operations_status`. Reconfirm STOP is engaged on the host and the original task is still queued with attempts zero.

**Do not start or recreate containers based solely on this document.** The VPS runtime configuration and ownership must first be examined, and a backup/rollback plan agreed. GitHub merge does not deploy this feature.

## Security limitations

The bridge bearer token authenticates the two local processes, not an individual ChatGPT user. Workspace access to the Somewhere plugin remains the outer user authorization boundary. Therefore, the bridge can serve **read-only status only**; task writes or paid actions must have independent per-user authorization and time-bound approval outside the tunnel.

A process with full access to the VPS or the agent's private state is still privileged; this design reduces unnecessary access by the MCP process but does not eliminate risk from host compromise. The rate limiter is local and process-memory based; use additional platform access controls and monitoring for production.

## Tests

`test/operations-http.test.js` verifies loopback-only binding, strong tokens, HTTP method restrictions, bearer protection, Origin rejection, sanitized projection, fail-closed client configuration and audit non-disclosure. Existing world and agent tests continue unchanged.
