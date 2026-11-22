# Control 0.9 — time-limited review and approval metadata

The first simulated task cycle has passed. Control 0.9 adds a **manual approval gate** bound to an exact queued task fingerprint. It deliberately does not yet send an API request. An approval file is a future input to a strictly supervised executor; it does not itself authorize spending or change the live queue.

## Guarantees and limitations

- The review packet binds repository, task ID, type and SHA-256 of task prompt/state.
- A matching approval is valid for 15 minutes after review and permits at most one supervised proposal by policy.
- The root-operated CLI requires STOP to be engaged and prints the full fingerprint for operator review.
- `approve` demands an exact fingerprint argument and stores a root-owned, mode 0600 JSON file in `/root/somewhere-approvals`.
- The CLI never reads API credentials, executes code, calls an AI service, publishes to GitHub, reserves a real task or changes STOP.
- **Approvals are metadata only.** A future executor must independently verify approval, budget and provider spending caps and must atomically consume approval to prevent replay. The current validator does not make approvals single-use.
- The existing `somewhere-agent` cannot read root-only approvals. Do not grant it root, Docker group or broad access to this directory.

## Operator workflow (optional, no paid AI use)

On the VPS, update the agent checkout first. The host does not have Node.js; use a dedicated Node 22 Docker container only if its filesystem mounts and isolation are reviewed. Do **not** copy the GitHub private key or API credentials into the web container.

For now, you can continue inspecting the queue using the offline Control 0.8 rehearsal. Do not attempt to run `approval-cli.js` inside the unprivileged agent container; it requires operator root identity and an intentionally restricted approval location.

## Requirements before a paid proposal

1. Separate root-operated, one-shot executor with secure API key file and no arbitrary command execution.
2. Atomically consume approvals, so no crash or retry can repeat an external call.
3. Provider billing controls, a realistic token cap and cost reconciliation.
4. Auditable task/status transitions, a strict timeout and a documented operator rollback.
5. Operator verification of configuration; no unattended tasks.

The actual queued task stays unchanged and emergency STOP must remain engaged.
