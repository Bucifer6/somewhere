# Somewhere Control 0.4 — safe task queue and worker foundation

## Intended separation

- Public web simulation: `/opt/somewhere/source`, in Docker, remains untouched.
- Dedicated agent account: `somewhere-agent`, with private workspace, logs, and task state; no sudo and no Docker socket access.
- Credential broker: a separate privileged verification-only service; not mounted into the agent workspace.
- Scheduler: one-shot process invoked by a supervisor. **Not enabled automatically.**

## Queuing a task

After merging and updating the agent checkout, as root:

```bash
runuser -u somewhere-agent -- \
  node /var/lib/somewhere-agent/workspace/somewhere/control/tasks-cli.js \
  add development-plan "Plan a safe implementation of individual memories for Hearth inhabitants."
```

The queue accepts only two task types: `development-plan` and `world-story-proposal`, with bounded text. Queue files are private to the agent account.

Inspect the queue:

```bash
runuser -u somewhere-agent -- \
  node /var/lib/somewhere-agent/workspace/somewhere/control/tasks-cli.js list queued
```

## Running the worker

```bash
# DISABLED by default, no provider API activity:
runuser -u somewhere-agent -- \
  node /var/lib/somewhere-agent/workspace/somewhere/control/agent-scheduler.js
```

It logs the disabled state and does **not** consume queued tasks. Node.js 22+ is required in the agent environment.

### Emergency stop

```bash
runuser -u somewhere-agent -- \
  touch /var/lib/somewhere-agent/state/STOP
```

The worker checks this before reserving tasks and again before calling the AI service. It doesn't cancel a call already in flight.

## Why it cannot perform autonomous coding yet

This phase introduces safe task persistence, idempotent task IDs, restricted task types, status logs, a disabled-by-default scheduler, and an emergency-stop check. The real paid execution path stays **intentionally disabled**, even if credentials are accidentally configured, until provider usage reconciliation and spending controls are verified.

The queue is currently single-worker-oriented; a crash while a task is reserved requires manual reconciliation. No arbitrary shell commands, untrusted code execution or GitHub write actions are connected. Those are separate security milestones requiring sandboxing and an allowlisted broker interface.

No production deployment should occur as a side effect of merging this PR.
