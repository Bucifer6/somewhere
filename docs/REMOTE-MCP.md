# Somewhere Control — private HTTP MCP transport

## Current capabilities

- Streamable HTTP-compatible stateless JSON-RPC responses on **POST /mcp**.
- A single bearer token, required on every request.
- Origin validation, JSON body size limit, no CORS, no access to shell/Docker.
- Read-only tools: health, world and roadmap.
- Default bind: 127.0.0.1:3100; attempts to bind to public interfaces are rejected.
- No API keys or passwords are stored in Git.

This first implementation **is not an OAuth 2.1 authorization server** and should **not** be exposed as a public internet MCP endpoint. Modern hosted ChatGPT MCP integrations may require OAuth, metadata discovery and additional transport features. Secure tunnelling and OAuth-compatible server features must be developed and verified before remote connector onboarding.

## Local testing

On the VPS, after reviewing and merging the PR and pulling the updated repository:

```sh
# Generate a random token and place it in a root-owned or service-owned
# permissions-0600 environment file OUTSIDE the Git repository.
openssl rand -hex 32

# In a private shell, export CONTROL_BEARER_TOKEN from that protected file.
CONTROL_BEARER_TOKEN=... node control/http.js
```

Do **not** paste the real token into ChatGPT, GitHub issues, commands stored in public CI logs or browser URLs.

Verify without printing the token:

```sh
curl -sS --fail http://127.0.0.1:3100/mcp \
  -H "Authorization: Bearer ${CONTROL_BEARER_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Running on the VPS requires a local Node.js 22+ runtime. This control process is intentionally not added to the public website's Caddy configuration or production Docker Compose file.

## Production requirements before remote connection

1. Use a dedicated unprivileged service account and supervised process.
2. Integrate reviewed OAuth authorization and protected-resource metadata.
3. Restrict access using a private tunnel or narrowly configured ingress with TLS.
4. Implement request rate limits, durable audit logs and credential rotation.
5. Enable GitHub push protection and provider account hard billing limits.
6. Add automated integration tests using the selected client and transport version.
7. Keep deployment tools in a separate permission boundary.

## Why no unattended coding yet?

A remote MCP connection is a tool-access transport, not a scheduler and not an autonomous development runtime. The isolated coding worker must be built and security reviewed separately. The creative proposal worker included in Control 0.1 remains disabled unless explicitly configured.
