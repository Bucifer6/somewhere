# Somewhere Control 0.1 — experimental foundation

This feature branch introduces two separate **local-only** entry points.

## Read-only MCP over stdio

```sh
SOMEWHERE_INTERNAL_URL=http://127.0.0.1:3000 node control/mcp.js
```

The supported MCP methods are `initialize`, `ping`, `tools/list` and `tools/call`. Tools are limited to `somewhere_health`, `somewhere_world`, and `somewhere_roadmap`. The process listens only on stdin/stdout, **not** the network. It doesn't support remote ChatGPT connections yet. Do not expose it with a generic open HTTP proxy. A later authenticated transport should enforce strong authorization, request limits and audit logging. It must not expose a Docker socket, root shell, or GitHub admin token.

## Creative proposal worker

```sh
# Disabled by default (no key, quota zero)
node control/worker.js
```

The worker runs once per invocation. It may be scheduled with a systemd timer under an unprivileged account, provided the operator explicitly enables it. It reads the world from a loopback API and writes a *text proposal* to its own restricted data directory. It cannot alter the world, execute code, push commits, merge PRs or deploy.

To enable it, configure secrets **outside Git** and set:
- `OPENAI_API_KEY`: restricted API key
- `CONTROL_MODEL`: model to call (default `gpt-4.1-mini`; verify current provider availability)
- `CONTROL_MONTHLY_LIMIT_USD`: local conservative threshold; zero disables worker
- `CONTROL_MAX_CALLS_PER_DAY`: daily call ceiling; zero disables worker
- `CONTROL_DATA_DIR`: private writable directory
- `SOMEWHERE_INTERNAL_URL`: local port 3000

**Do not treat the local spending threshold as a guaranteed hard cap.** This version records calls but does not reconcile monetary usage with provider bills. Enforce a real hard limit at the provider/account level (if available), and use the local daily call cap. A failed request still consumes a call slot. Never place API keys in GitHub or public endpoints.

## Risk boundary

This is not a general-purpose autonomous coding agent. It is deliberately limited to read-only MCP and creative proposal drafts. Autonomous coding requires a separate, isolated build worker, a restricted GitHub App, CI security gates, approvals, rollback and verified billing controls. The live Caddy application is not modified by this branch.

## Tests

```sh
npm test
```
