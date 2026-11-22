import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

const API = "https://api.github.com";
const USER_AGENT = "Somewhere-Control/0.3";
const INSTALLATION_PERMISSIONS = Object.freeze({
  contents: "write",
  pull_requests: "write"
});

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function githubAppJWT({ appId, pem, now = Math.floor(Date.now() / 1000) }) {
  if (!/^\d+$/.test(String(appId))) throw new Error("Invalid GitHub App ID");
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: now - 60,
    exp: now + 540,
    iss: String(appId)
  }));
  const body = header + "." + payload;
  const privateKey = createPrivateKey(pem);
  const signature = sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
  return body + "." + signature;
}

async function githubJSON(path, { method = "GET", bearer, body, fetcher = fetch } = {}) {
  const response = await fetcher(API + path, {
    method,
    headers: {
      authorization: "Bearer " + bearer,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": USER_AGENT,
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("GitHub API returned HTTP " + response.status);
  return response.json();
}

export async function checkInstallation({ appId, installationId, keyPath, repository = "Bucifer6/somewhere", fetcher = fetch }) {
  if (!/^\d+$/.test(String(installationId))) throw Error("Invalid installation ID");
  if (repository !== "Bucifer6/somewhere") throw Error("Repository not allowed");
  const pem = await readFile(keyPath, "utf8");
  const jwt = githubAppJWT({ appId, pem });
  const tokenResult = await githubJSON("/app/installations/" + installationId + "/access_tokens", {
    method: "POST",
    bearer: jwt,
    body: {
      repositories: ["somewhere"],
      permissions: INSTALLATION_PERMISSIONS
    },
    fetcher
  });
  if (typeof tokenResult.token !== "string" || !tokenResult.token) throw Error("GitHub installation token missing");
  // Verify that installation access is scoped to the exact target repository.
  const repositories = tokenResult.repositories;
  if (!Array.isArray(repositories) || repositories.length !== 1 || repositories[0].full_name !== repository) {
    throw Error("Installation token repository scope was not verified");
  }
  // The token is NEVER returned by the broker, logged or written to disk.
  const repo = await githubJSON("/repos/Bucifer6/somewhere", {
    bearer: tokenResult.token,
    fetcher
  });
  if (repo.full_name !== repository) throw Error("Unexpected repository identity");
  return {
    status: "ok",
    repository,
    installationAuthenticated: true,
    // Do not include token, JWT or private key.
    expiresAt: tokenResult.expires_at ?? null
  };
}
