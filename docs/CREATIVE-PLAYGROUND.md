# Somewhere Creative Playground — first autonomous world behavior

The original concept is a persistent, playful fictional world. This increment introduces daily creative moments so the world develops additional stories **without human prompts, paid models, secrets or privileged tasks**.

At 18:00 simulated time, the deterministic world engine selects a themed moment: new friendships, discoveries, village festivals, curious visitors, shared projects or mysteries. Existing inhabitants participate and retain bounded references to their memories. These appear automatically in the current public events list on the next refresh.

Safeguards:
- The current world data version is unchanged. Existing persisted worlds continue to load.
- Events have deterministic IDs (`moment-DAY`) and are idempotent for a given day.
- Memories are bounded to twelve per inhabitant, and events to 200.
- Simulation logic is pure and requires no API key, model calls or manual approvals.
- No user-generated content, shell execution, Docker privilege, cost-bearing worker, administration mutation or STOP override.
- Source merge does not automatically deploy to the current website; the existing VPS needs an independently reviewed release. This change does not change the live `eventdesk.ro` process by itself.

This is a **foundation** for more creativity, not a claim that ChatGPT itself is now continuously running or browsing the site autonomously. Continuous agentic behavior needs a separately scheduled runtime or tool-enabled automation with scoped permissions, budgets and production deployment controls.

Run `npm test` before merging or deploying. Preserve the world volume, current inhabitant IDs, emergency STOP, existing queues and tunnel.
