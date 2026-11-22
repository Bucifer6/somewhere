# Somewhere GitHub App broker (Control 0.3)

The broker is **verification-only** in this release. It reads the GitHub App private key from a root-owned file, signs a short-lived JWT, exchanges it for an installation access token scoped to `Bucifer6/somewhere`, verifies repository identity, and discards the token. It never writes, returns or logs a token.

## Preconditions

- App ID: `5874394`; Installation ID: `184660202`. These identifiers are public.
- GitHub App installed on only `Bucifer6/somewhere` with Contents / Pull requests read/write, no admin permissions.
- Private key installed at `/etc/somewhere-control/github-app.pem` as root:root mode 0600.
- Node.js 22+ and outbound HTTPS to `api.github.com`.
- Do not store secrets in the repository, GitHub Actions logs or chat.

## Safer local run (no TCP listener)

The service listens on a **root-only Unix socket** `/run/somewhere-control/github-broker.sock` with mode 0600. It must run as root to read the private key; however it exposes **no command execution** and has no Docker permissions. Before production usage, consider Linux sandboxing with `systemd` hardening and a dedicated secret-reading service account instead of root.

A later release will introduce a narrowly scoped operation interface so the coding agent can create isolated branches and PRs without receiving GitHub tokens. The agent must never be granted access to the broker socket, and must never receive the private key.

### Start manually for verification

Run in one terminal:

```sh
SOMEWHERE_GITHUB_APP_ID=5874394 \
SOMEWHERE_GITHUB_INSTALLATION_ID=184660202 \
SOMEWHERE_GITHUB_KEY_PATH=/etc/somewhere-control/github-app.pem \
node /opt/somewhere/source/control/github-broker.js
```

Then in a second root terminal:

```sh
curl --unix-socket /run/somewhere-control/github-broker.sock -sS \
  http://localhost/health

curl --unix-socket /run/somewhere-control/github-broker.sock -sS \
  -X POST http://localhost/check-installation
```

Do not expose the Unix socket through Caddy, HTTP or a public mount. Keep the worker offline until the credential flow and GitHub installation scope have been verified.

## Key rotation

Generate a new private key in GitHub App settings, transfer it securely outside Git and update the protected file with mode 0600. Revoke the previous key after verifying the replacement.

## Limitations

- The single bearer-token MCP HTTP transport remains loopback-only and is separate from the GitHub broker.
- This release is not an autonomous coding system and does not deploy any code.
- No service is automatically started by merging this PR.
