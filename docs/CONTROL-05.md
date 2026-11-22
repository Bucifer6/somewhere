# Somewhere Control 0.5 — restricted operations, still operator-controlled

This milestone provides **a deliberately narrow GitHub proposal publisher**, not an unrestricted autonomous code writer.

## Scope

- `control/github-proposals.js` exchanges the root-owned GitHub App private key for a short-lived installation token restricted to `Bucifer6/somewhere`.
- It can create **one branch**, **one Markdown documentation proposal** in `docs/agent-proposals`, and **one draft pull request** against protected `main`.
- It never accepts an arbitrary repository, branch, file path, commit instruction or GitHub API method from the caller.
- The token stays inside this process and is never returned or written to disk.
- `control/github-ops-cli.js` is **operator-only**, requires root and a root-owned 0600 JSON proposal under `/root/`.
- No new service listens on the public network. The existing STOP file remains engaged; automated executions are not enabled.

## Operator workflow (not enabled or tested against the live repo yet)

Create a private proposal file manually, e.g. with `umask 077`; the JSON must contain `taskId` (UUID), `title` and `content`. A real run performs GitHub writes. First confirm repository scopes and review the file.

Run from a Node.js 22+ environment with access to the protected PEM, setting only the public App and Installation IDs:
```sh
SOMEWHERE_GITHUB_APP_ID=5874394 \
SOMEWHERE_GITHUB_INSTALLATION_ID=184660202 \
node control/github-ops-cli.js /root/approved-proposal.json
```

**Do not run this in the public web container.** The operator must use a dedicated runtime with filesystem access restricted to the key and one approved proposal. No autonomous worker should read the PEM, receive the installation token or invoke this operation directly.

## Future safeguards before unattended writes

- Replace the operator CLI with an allowlisted authenticated request broker, including human approval gates and dedicated Unix socket ACLs.
- Rate limiting and durable append-only audit logs.
- Idempotent GitHub operations and rollback/reconciliation of partial operations.
- Limit GitHub App capabilities in GitHub itself and verify permission grants.
- Build ephemeral coding/test environments without privileged Docker access, host networking or production mounts.
- Add a durable provider usage/budget limiter and reconcile with provider billing.
- Honour and test the emergency STOP switch during active work.

The current worker is intentionally disabled for paid execution. Do not put API keys in GitHub, environment output or chat.
