# Control 0.7 — scheduler and durable budget wiring

This release integrates the in-process proposal scheduler (`control/agent-scheduler.js`) with the single-host durable ledger (`control/usage-ledger.js`) **for dependency-injected, offline-tested executions**.

## Execution safety

- The scheduler refuses an enabled task unless both an explicit policy and an operational ledger are supplied.
- On every allowed task, it reserves a conservative worst-case allowance **before** invoking a provider, and retains this allowance even if the call fails or is interrupted.
- It checks the emergency STOP before reserve, after reserve and after provider completion.
- When ledger access fails, the task is failed without calling a provider. If reservation is denied, it records a failed task; no retries occur.
- The response is written to a private output file. Generated content is never executed or automatically published to GitHub.
- Tests use only mock provider callbacks. No real API key or paid requests are used.

## Important: still not ready to run unattended

The CLI entry point still rejects enabled paid operation. This is **intentional**: provider-side hard spending enforcement, real-billing reconciliation, task cancellation semantics, secure input handling, logging persistence and a supervised runtime have not yet been validated.

The ledger's `worstCaseUsdPerCall` is an administrative assumption, **not** a provider-enforced or guaranteed maximum cost. Even successful quota tests cannot establish real financial safety. The current per-request budget policy also lacks task-level monetary reconciliation.

No network-facing control API has been added, no root shell or unrestricted GitHub token has been granted, and production continues unchanged. The STOP file remains in place.

## Operator verification

With the repository on `main` and the staged-test runner deployed, use the existing network-disabled staged test command:

```sh
bash /var/lib/somewhere-agent/workspace/somewhere/control/staged-test.sh
```

Do not remove `/var/lib/somewhere-agent/state/STOP` or set `SOMEWHERE_AGENT_ENABLED=true` for this release.
