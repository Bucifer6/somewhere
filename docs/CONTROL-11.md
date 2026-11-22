# Control 1.1 — supervised one-shot text proposal (disabled by default)

This release adds a **single provider invocation path**, with no unattended scheduler activation. The exact existing first queued task stays queued until the operator explicitly follows a documented workflow. There is **no billed call in the tests or deployment**.

## Boundaries

- `control/provider-client.js` accepts only allowlisted `gpt-4.1-mini`, no tools, `store:false`, at most 1,200 output tokens; the operator CLI sets 800. It returns a text proposal and provider-reported token usage, not code execution.
- `control/supervised-provider.js` checks the engaged STOP file, verifies task-specific time-limited approval, writes a permanent exclusive task-attempt marker, makes a durable budget reservation, consumes the approval, checks STOP again, performs **at most one** external provider call, checks STOP after the call, and writes output privately. Failed attempts are never retried.
- A separate approval ID cannot bypass the permanent task-level one-call marker.
- `control/paid-one-shot-cli.js` is disabled unless the operator explicitly sets `SOMEWHERE_PAID_ONE_SHOT_ENABLED=EXPLICIT_OPERATOR_ENABLE`, `SOMEWHERE_PROVIDER_LIMIT_VERIFIED=YES`, and supplies the exact reviewed SHA-256 fingerprint. This is **self-attestation**, not automatic verification of billing limits.
- The API key is loaded only from a root-owned private regular file, `/root/somewhere-secrets/openai-api-key`, mode 0600. It is never accepted via command arguments or committed to source control.
- The operator CLI is one-shot, not a scheduler, and never invokes Docker, shell commands, GitHub writes, merges, deployments or world changes.
- The existing emergency STOP **must remain engaged**, even during this manual operation. STOP pauses autonomous work, but does not prevent this independently approved one-shot path.
- An output file is a proposal to review; it is never executable or automatically published.

## Financial and operational caveats

This design reserves an assumed **USD 1.00 per attempt**, max one attempt per UTC day and calendar month, in `/var/lib/somewhere-agent/state/paid-usage`. The $1.00 is a policy assumption, **not a guaranteed maximum bill or provider-enforced spend cap**. The ledger records conservative estimated reservations but is not an invoice. You must configure and check API project funding, model pricing, account limits, and usage in the provider portal. Account alerts and soft limits may not immediately stop charges.

Calling the API makes a paid network request. Do not attempt it without independently verifying permissions, spending and expected token cost. A ChatGPT subscription does not cover API use.

The executor's output and audit remain local. Provider text may be inaccurate or contain malicious instructions; treat it strictly as untrusted content.

## Operator preparation (NOT yet performed)

The host presently has Node.js in Docker rather than installed directly. To use the root-only executable, first prepare a **dedicated, reviewed Node 22 runtime** that can read the private approval directory, credential file and the queued task, without mounting production storage, Docker socket, GitHub App credentials or the web container's data. A Docker runtime with host root and mounted root secrets is sensitive; isolation must be reviewed before issuing an execution command.

Suggested sequence: confirm provider project-level billing controls; securely create the private API key file; review the task and create a fresh approval bundle (Control 1.0); inspect it with `paid-one-shot-cli.js preview FILE`; compare the full fingerprint; explicitly enable execution for the single invocation only; review the generated private text proposal and API billing results. Do not use persistent enabling flags or add this CLI to cron/systemd.

**No key or payment information should be pasted into ChatGPT.** Keep STOP engaged. This release is ready for isolated tests, not a claim that unattended paid automation is safe.
