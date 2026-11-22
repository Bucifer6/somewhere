# Somewhere — Development roadmap

## Genesis 0.1 (live prototype)
- A single static browser illustration, manually deployed to eventdesk.ro.
- No server state or persistent simulation.

## Genesis 0.2 (this source foundation)
- Deterministic server-side clock and inhabitant movement.
- Persistent JSON world state, safely replaced after each tick.
- Read-only world and health APIs.
- Responsive, canvas-based public interface.
- Docker Compose with a persistent volume and loopback-only port binding.
- Basic unit tests.

### Known limitations
- One server process and JSON file; no database migrations or horizontal scaling yet.
- One simulated hour per real minute; process downtime currently pauses simulation.
- No authentication, private Observatory, user contributions or paid AI calls yet.
- AI development agents must never have production Docker socket or unrestricted root access.
- Changes here are **not** auto-deployed to the VPS.

## Genesis 0.3
- Replace the prototype deployment using a reviewed, non-root release procedure.
- Add HTTPS reverse proxy configuration and automated backups.
- Add world-time catch-up after downtime with an upper bound.
- Add interactive visitor actions with abuse prevention and rate limiting.
- Observatory: authenticated, read-only audit panel.

## Genesis 0.4+
- Settlement resources, ecology, NPC decisions, social relationships and story arcs.
- Scheduled creative AI workers with strict quotas and human-approved deployment boundaries.
- Agent testing in ephemeral isolated environments; staged rollout and rollback.
