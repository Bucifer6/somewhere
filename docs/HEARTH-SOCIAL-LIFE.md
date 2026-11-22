# Hearth Social Life — Autonomous World Milestone

This feature extends Somewhere's free, server-authoritative fictional simulation. It is designed to continue independently **within the running simulation process**; no continuous ChatGPT conversation, AI provider or billable API is required.

## What happens
- Each simulated day at 12:00, two existing inhabitants take part in a deterministic, friendly social interaction.
- Pairwise bonds grow from 1 to 5 and remain bounded to 40 records.
- The people of Hearth work together on imaginative community projects, one progress step per day. After a project completes they celebrate it and begin another, up to a bounded archive of twelve projects.
- Social interactions and project celebrations appear as safe, textual entries in the existing Chronicle; the 18:00 creative moments continue unchanged.
- The public website gains responsive, read-only panels showing project progress and friendships. It uses `textContent` and DOM construction rather than interpreting world text as HTML.

## Compatibility and limits
- Preserves the version-1 JSON world format, current IDs, coordinates, events, clock and existing persistent world volume.
- Legacy saves without `relationships` or `projects` gain those fields on their first midday tick. No destructive migration.
- Project, relationship, memory and event histories are capped. No uncontrolled population growth.
- Social decisions derive only from the existing seed and simulated day, so rerunning the same state gives the same outcome.
- This code makes **no web requests** and cannot spend API credits, run shell commands, deploy anything or alter agent STOP. The creative simulation runs independently of the separate developer emergency STOP, which remains engaged.

## Release boundary

Merging to `main` does NOT deploy `eventdesk.ro`. Production currently requires a verified release path with a preserved copy of the `source_somewhere-world` volume, testing on the current stored state and a rollback. Do not run `docker compose down -v`; do not mount the Docker socket or production world data into an autonomous agent.

The existing MCP tools remain read-only. Full AI-driven continuous website operation still requires a separately deployed, deliberately scoped agent runtime with scheduling and a guarded deployment workflow. This feature supplies useful low-cost autonomy inside the world while that infrastructure is designed.

## Verification
`npm test` verifies deterministic, idempotent midday interactions, capped relationships and projects, legacy-save compatibility, and coexistence with evening creative moments.
