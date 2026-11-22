# Somewhere MCP operations — safe first expansion

This release adds **read-only diagnostics and project status** to the existing authenticated MCP service. It does not give ChatGPT a shell, task-write permission, Docker access, a deployment executor, secrets or GitHub credentials.

## Tools

- `somewhere_health`, `somewhere_world`, `somewhere_roadmap`: existing tools.
- `somewhere_diagnostics`: fetches the loopback world API health and world snapshots, returning a limited summary and checks for health, matching tick counters, unique inhabitant IDs, and valid non-negative settlement population.
- `somewhere_project_status`: reports the version of the deployed source, the read-only capability boundary and explicitly marks the autonomous developer STOP as **not observable** from the control container. Never treat this value as proof that STOP is disengaged.

Every tool has zero accepted input arguments. The control HTTP endpoint stays loopback-only with constant-time bearer authentication, and no public port or external URL is introduced.

## Audit

The control HTTP entrypoint now logs bounded JSON `mcp_audit` records to stderr / container logs containing timestamp, action (allowlisted tool name for tool calls), HTTP status and duration. The audit records do **not** include request bodies, Authorization headers, API keys, tokens, full tool results or client-supplied tool names that are outside the allowlist.

Container logs should be rotated and treated as operationally sensitive. No logging of secrets is intentional; deployment operators must independently review their existing Docker logging driver and retention.

## Deploy after CI has passed

This code is not activated on the VPS by merging a PR. An operator must update `/opt/somewhere/source` from the reviewed commit and rebuild **only the control service** using the existing deployment configuration. Do not use `docker compose down -v`, alter the persistent world volume, modify `somewhere-tunnel` or expose port 3100.

The running tunnel must remain on `127.0.0.1:3100/mcp`; the new tools will be discovered after the control service is redeployed and ChatGPT refreshes the plugin metadata. Re-run the local authenticated MCP handshake, confirm five advertised tools, then exercise `somewhere_diagnostics` and `somewhere_project_status` from ChatGPT.

Run `npm test` before production deployment. Confirm the emergency STOP directly on the VPS: `test -e /var/lib/somewhere-agent/state/STOP && echo ENGAGED || echo ABSENT`. Do not remove it.

## Deferred privileged operations

Task edits, controlled checks that execute processes, GitHub writes and deployments **remain disabled**. They need an independently reviewed design with individual user identity, tool-specific authorization, non-replayable approvals, persistent audit records, explicit allowed arguments, rate limits, rollback and an emergency STOP that is evaluated server-side. ChatGPT's conversational confirmation alone must not bypass these requirements.
