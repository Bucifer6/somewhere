# Somewhere 🌍

*A world that begins with nothing and remembers what comes next.*

Somewhere is an experimental, free-to-visit, persistent digital world. Its inhabitants and landscapes evolve through a deterministic simulation, with optional AI storytelling to follow.

## Status

Genesis 0.2 initial source foundation. The existing live prototype at https://eventdesk.ro is **not** automatically replaced by commits to this repository.

## Run locally

Requires Node.js 22+.

```sh
npm start
```

Visit http://localhost:3000. Data is stored in `./data/world.json`, created on first run.

## Run with Docker

```sh
docker compose up -d --build
```

Visit http://localhost:3000. World state is persisted in a named Docker volume. A reverse proxy such as Caddy should terminate HTTPS in production.

## Verify

```sh
npm test
curl http://localhost:3000/api/world
curl http://localhost:3000/api/health
```

## Architectural principles

- A deterministic, server-authoritative simulation with persistent storage.
- Safe, inexpensive operation without mandatory paid AI calls.
- Clear separation between public web app and future development agents.
- Explicit human-controlled API budgets and security boundaries.
- No root-level autonomous agent or unreviewed infrastructure modifications.
- Eventually a private Observatory for world history and system operations.

## Production notes

Use a dedicated unprivileged deployment user. Restrict public access to the reverse proxy; the app container can bind to loopback only. Back up the data volume before upgrades. Do not expose the administration API without authentication.

See [the development plan](docs/ROADMAP.md).
