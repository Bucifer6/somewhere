# Secure outbound MCP tunnel for Somewhere

## Scope

This is a **prepared deployment configuration**, not proof of an installed or live tunnel. The official OpenAI `tunnel-client` connects a private MCP listener to ChatGPT using outbound HTTPS. It does not require a static public IP, inbound port or a new public DNS record.

- Local MCP backend: `127.0.0.1:3100/mcp`; existing bearer authentication and read-only MCP tool allowlist remain intact.
- Official tunnel client: [openai/tunnel-client](https://github.com/openai/tunnel-client).
- Tunnel management: https://platform.openai.com/settings/organization/tunnels
- Runtime API keys: https://platform.openai.com/settings/organization/api-keys
- ChatGPT Plugins: https://chatgpt.com/#settings/Connectors
- OpenAI setup guide: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- Official onboarding: https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md

**This guide intentionally does not activate paid AI execution, add write-capable MCP tools, modify the web proxy or remove the emergency STOP.**

## Step 1: platform setup (operator action)

1. In OpenAI Platform **Tunnels**, create a private tunnel associated with the intended ChatGPT workspace/Platform organization. Obtain its complete `tunnel_id` (not an API secret).
2. Ensure the runtime key principal has **Tunnels Read + Use**. The manager needs **Read + Manage**. Avoid admin keys in the daemon.
3. Create a dedicated *runtime* API key in Platform. Tunnel API-key permissions and ChatGPT's custom MCP connector permission are separate. **Never paste the key in chat, GitHub or terminal history.**
4. In ChatGPT, use Plugins → Add custom MCP server → Tunnel, then select the created tunnel. This can be completed only after the tunnel daemon is ready.

## Step 2: VPS preparation (operator action)

Use `bash /var/lib/somewhere-agent/workspace/somewhere/deploy/tunnel/diagnose.sh` to check local listener, STOP and HTTPS, without disclosing secrets.

Install `tunnel-client` from the **official, current release selected by OpenAI Platform Tunnels**. Review signature/provenance and pin the installed version; do not execute an unverified curl-to-shell installer. Run `tunnel-client help quickstart` after installation.

The versioned `deploy/tunnel/somewhere-profile.yaml` is a template. Copy it to a **private** configuration path and replace the sample `tunnel_id` with the complete ID returned by Platform. Do not commit the installed profile with operational identifiers or credentials.

Create a dedicated service user (no shell login, no docker/sudo membership) for the tunnel client. Restrict its reachable services to outbound OpenAI HTTPS and the loopback MCP backend. If the tunnel client is on the same VPS, `127.0.0.1:3100` resolves to the existing MCP listener when using host networking. The client must not receive the GitHub PEM, Docker socket, agent workspace, production world volume or OpenAI planning API keys.

Secret files, created separately by the operator, should have restrictive ownership and mode `0600`, accessible **only to the tunnel service account**:

- `/etc/somewhere-tunnel/runtime-api-key`: the dedicated OpenAI tunnel *runtime* key, not an OpenAI admin key.
- `/etc/somewhere-tunnel/mcp-authorization`: the complete HTTP `Authorization` header value, namely `Bearer <existing control token>`. It must be copied securely from the **existing** MCP control configuration without printing the token or changing the existing server.

The profile uses the official client's `file:` secret references for the tunnel API key and both regular/discovery MCP request headers. Do not put actual tokens in the YAML profile or command-line flags. Confirm `tunnel-client` supports the given profile against the **installed client version**.

## Step 3: foreground verification

Run the daemon under the dedicated unprivileged account (not root, Docker, or a public web process) after all secrets, permissions, and tunnel ID are installed:

```sh
tunnel-client doctor --profile-file /etc/somewhere-tunnel/somewhere-profile.yaml --explain
tunnel-client run --profile-file /etc/somewhere-tunnel/somewhere-profile.yaml
```

In another terminal, check the configured loopback health port:

```sh
curl -fsS http://127.0.0.1:3808/healthz
curl -fsS http://127.0.0.1:3808/readyz
```

Only after successful local readiness should the operator attach the custom MCP server in ChatGPT and check that **exactly** `somewhere_health`, `somewhere_world` and `somewhere_roadmap` are available. Read-only tool results must match the live world. Then decide whether to supervise the process with systemd, with restrictive filesystem access and no elevated capabilities.

## Security and operation

- The outgoing tunnel avoids public inbound firewall rules; it is still an authenticated remote access pathway, not a sandbox.
- The existing bearer token is transmitted to the local MCP backend by the tunnel client. Platform and ChatGPT authorization govern who can invoke the tunnel; allow only the intended user/workspace.
- Keep the existing MCP HTTP server on loopback, do not expose `3100` publicly, and do not bypass origin checks. If discovery requests are rejected, inspect the client's auth header handling rather than disabling authentication.
- The current control service is read-only. **No** root shell, arbitrary file access, Docker control, GitHub write or paid-AI-execution tools are permitted through this connector.
- The STOP file at `/var/lib/somewhere-agent/state/STOP` must remain engaged.
- Rotate the dedicated tunnel API key and the local MCP bearer token if either is disclosed. Review logs for accidental credential exposure; keep tunnel UI and health bound to loopback.
- If the service cannot be reached, verify tunnel readiness, workspace associations, runtime key privileges and ChatGPT plugin connection before editing the firewall.

## Not performed from GitHub

GitHub source changes **cannot install a binary on the VPS, provision Platform tunnel identity or connect ChatGPT's UI automatically**. A VPS shell and explicit Platform/ChatGPT setup are still necessary. Do not claim the tunnel is connected before the operator verifies actual runtime readiness and connector discovery.
