# Somewhere Control 1.0 — single-use approval consumption

This milestone hardens the approval lifecycle without enabling any paid or unattended execution.

- `control/approval-consumer.js` verifies an explicit bundle of review packet and approval, checks its 15-minute window and exact queued task fingerprint, and atomically creates an exclusive permanent consumption marker.
- Concurrent or repeated attempts to consume the same approval are rejected. A crash after consumption permanently burns that approval. Recovery is manual; no automatic retry.
- `control/one-shot.js` provides an offline-only one-shot path. It requires STOP to remain engaged, checks the approval and live queued task, burns approval **before** invoking the injected test callback, and writes a private preview. The real task is left queued.
- Tests cover expiry, fingerprint changes, STOP presence, concurrent replay, failure after consumption, and unchanged task queue.

**No actual provider access exists in this one-shot module**, even if the operator sets an API key. No root shell, GitHub writes, remote listen port, background scheduling or deployment has been added.

## Important compatibility and access notes

The previous Control 0.9 `approval-cli.js` writes only the `approval` object. It does **not** yet write a full `{packet,approval}` bundle. The new consumption module is intentionally a non-operational foundation until the CLI and operator review are updated together. Do not attempt to use root approval files to make provider calls.

The approval file must stay root-private; do not mount it, the GitHub App key or AI provider credentials into the normal agent worker. The project still needs a dedicated operator-owned runtime, provider usage reconciliation, spending limits, authentication and repeatable recovery tests before a first billable request. The persistent STOP remains engaged.

Reviewing a file or accepting a proposal must never implicitly activate paid AI, merge a pull request or deploy.
