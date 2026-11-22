# Somewhere Control 1.0 — single-use approval consumption

This milestone hardens the approval lifecycle without enabling any paid or unattended execution.

- `control/approval-consumer.js` verifies an explicit bundle of review packet and approval, checks its 15-minute window and exact queued task fingerprint, and atomically creates an exclusive permanent consumption marker.
- Concurrent or repeated attempts to consume the same approval are rejected. A crash after consumption permanently burns that approval. Recovery is manual; no automatic retry.
- `control/one-shot.js` provides an offline-only one-shot path. It requires STOP to remain engaged, checks the approval and live queued task, burns approval **before** invoking the injected test callback, and writes a private preview. The real task is left queued.
- Tests cover expiry, fingerprint changes, STOP presence, concurrent replay, failure after consumption, and unchanged task queue.

**No actual provider access exists in this one-shot module**, even if the operator sets an API key. No root shell, GitHub writes, remote listen port, background scheduling or deployment has been added.

## Important compatibility and access notes

The Control 1.0 `approval-cli.js` now writes `{packet,approval}` bundles, and `one-shot-cli.js` accepts only those private root-owned files. `preview` validates without consuming; `run-offline` atomically consumes an approval and writes an **offline simulated** development preview. The consumer preserves the consumed marker permanently even on an error. This is not yet a paid execution workflow.

The approval file must stay root-private; do not mount it, the GitHub App key or AI provider credentials into the normal agent worker. The project still needs a dedicated operator-owned runtime, provider usage reconciliation, spending limits, authentication and repeatable recovery tests before a first billable request. The persistent STOP remains engaged.

Reviewing a file or accepting a proposal must never implicitly activate paid AI, merge a pull request or deploy.

## Operator commands (only after VPS checkout is updated)

The VPS host currently uses Docker for Node.js. These commands require a dedicated operator-only Node 22 runtime with the expected private filesystem mounts, not a public web container. Do not grant GitHub private keys or OpenAI credentials to that runtime. `approval-cli.js review` prints a task fingerprint; `approve FINGERPRINT` writes the full root-only bundle; `one-shot-cli.js preview APPROVAL_FILE` checks it; and `one-shot-cli.js run-offline APPROVAL_FILE` burns it to create a simulated plan. The approval expires after fifteen minutes. These commands never send network requests and do not dequeue the live task. Do not remove STOP.
