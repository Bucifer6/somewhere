# Control 2.3 — signed operator authorization foundation

This phase adds an Ed25519 verification library and offline tests to prepare for future **website-based** task intake. It does NOT expose a write API, expand MCP permissions, enable paid AI, use a VPS shell, issue approvals, deploy changes, or disengage STOP.

## Threat model / behavior

- The signing **private** key belongs to an authenticated operator or independently trusted approval service; it is never copied to ChatGPT, its MCP tunnel, the control container or GitHub.
- The verifier loads an allowlisted public key registry. Every signed object must bind exactly one task digest, audience `somewhere-control-2.3`, operation `enqueue-proposal-only`, operator ID, UUID nonce, issuance time, and expiry (at most five minutes).
- A valid signature authorizes only the creation of an **unapproved, unexecuted queued proposal**. Existing execution approvals remain independent.
- The nonce is permanently consumed in private agent-state storage **before** the queue operation (O_EXCL). A crash burns the authorization and requires a fresh signed request; there is no retry.
- Existing task intake separately enforces agent ownership, private directories, STOP engaged, queue limits, exact request digest and durable intent/completion audit.
- This foundation currently calls `submitSignedTask` only as a library API. It is not imported into the network-facing operations server or exposed as an MCP tool. **Do not put an Ed25519 private key on the VPS or deploy any write listener from this milestone.**

## Before genuine website operation

Implement an operator-login website UI with proven user identity, CSRF protections, short-lived one-use approval issuance (preferably using an external identity provider or hardware-backed signing), request preview, audit/reconciliation, recovery/rollback procedures and an independently reviewed write endpoint isolated from the read-only service. Ensure authorization cannot be minted by the same shared bearer token that authenticates the MCP tunnel. Confirm the user can delegate approvals narrowly without granting permanent broad control.

A separate audited deployment pipeline with signed release selection, CI, backups and rollback is required for website deployment. The project currently has no verified deployment credential/path available through ChatGPT tools, so merging code does **not** modify the running website.

## Verification

Run `npm test` on Node 22. Tests cover cryptographic signature validation, exact task digest binding, operator allowlist, expiry/not-before, invalid operations, nonce replay and STOP-gated queue-only behavior (the integration tests skip enqueue assertions when running as root, because production intake refuses root).

Keep `/var/lib/somewhere-agent/state/STOP` engaged. The existing queued task must stay unmodified.
