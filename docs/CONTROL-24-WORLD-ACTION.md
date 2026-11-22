# Somewhere Control 2.4 — Bounded Creative World Actions

This introduces an **opt-in** seventh MCP tool, `somewhere_world_action`, for the creative playground. It only changes fictional world state. Nothing runs shells, changes configuration, accesses Docker, approves development tasks, triggers a deployment or overrides the separate emergency STOP.

## Supported actions

- `create_event`: `{action,requestId,title,story}`; writes one Chronicle event
- `introduce_character`: `{action,requestId,name,description}`; introduces a friendly new inhabitant in Hearth
- `start_project`: `{action,requestId,name,description}`; begins a village community project

`requestId` is a random UUID v4, reused **unchanged** if the caller retries after a timeout. Unknown request fields, URLs, markup, control characters, invalid text and unsupported operations are refused. There is no arbitrary event JSON, code, HTML, file path or external request support.

Safeguards: an independent strong creative-action secret, optional tool discovery, rate limit of eight new actions per simulated day, total action registry limited to 2048, no more than 32 inhabitants, 12 projects and 200 Chronicle events. Accepted request IDs persist alongside the world so replayed requests cannot reapply mutations. Conflicting input with an old requestId returns `already-applied` (caller must not treat that as approval of changed text). Failing to save the world returns an error and rolls back the in-memory mutation. Operation type and request ID, **not the payload or secret**, enter service audit logs.

## Activation boundaries

**Not activated by a merge.** Production uses a Dockerized simulation whose source must be independently updated and smoke-tested with its persistent world backed up first. Both the server and MCP container require the **same** fresh strong secret, but must not share Docker privileges or the world data mount.

- Simulation: `SOMEWHERE_WORLD_ACTION_TOKEN` is opt-in. When unset, the write endpoint responds 404. This secret must be provisioned securely outside the repo; avoid secrets in shell history and logs.
- MCP: `SOMEWHERE_WORLD_ACTION_KEY_FILE=/run/secrets/somewhere-creative-token` enables the tool only when a secret file is securely mounted there as a regular, non-symlink, service-UID-owned mode-0600 file. If unset, the original six-tool deployment remains read-only.
- The MCP must be deployed *after* the simulation supports and has enabled the write endpoint. Keep existing authentication, tunnel and operations bridge unchanged.
- The underlying `POST /internal/creative-action` requires the independent secret and explicitly denies browser Origin headers. Add a reverse-proxy deny rule for `/internal/*` **before** deploying, so the endpoint is never publicly routed. Token authorization remains mandatory regardless of proxy rules.

A write-capable MCP tool authorizes fictional world changes through the ChatGPT connector. It does **not** run on its own while ChatGPT is inactive; an independent scheduler/agent still requires a separate implementation.

## Before enabling it on the VPS

1. Review and pass `npm test` in CI.
2. Ensure world volume backup is verified and restore procedure documented; verify that the new code preserves existing `world.json`.
3. Configure Caddy's `/internal/*` denial and test it from outside the VPS.
4. Provision an independent secret to the simulation and restricted MCP container without disclosing it through ChatGPT.
5. Deploy and restart **only** the required containers through the controlled release procedure.
6. Verify no secret: unconfigured -> tool absent; unauthorized requests -> 401; wrong method -> 405; a single harmless authorized creative event succeeds; replay -> `already-applied`; world state persists after a safe restart.
7. Confirm emergency STOP and original task queue unchanged. This new endpoint only affects fictional simulation and does not use the developer agent.

If automated deployment credentials/controls are not available via a connected tool, do not claim the tool is live and do not work around STOP. The repository merge alone cannot activate this capability.

## Operational caveat

Keep the independent bearer token narrowly scoped and rotate it if compromised. This is a lightweight single-operator creative interface, not multi-user OAuth or an unattended root agent. The event history and action registry have finite bounds, deliberately requiring an explicit future archival migration rather than silently forgetting replay IDs.
