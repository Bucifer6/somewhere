#!/usr/bin/env node
// GitHub App credential broker: root-only Unix socket, no token-returning API.
// Initial release supports verification only; no arbitrary GitHub actions.
import http from "node:http";
import { mkdir, chmod, unlink, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { checkInstallation } from "./github-auth.js";

const DEFAULT_SOCKET = "/run/somewhere-control/github-broker.sock";

function reply(res, code, body) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

export function createBroker({ config, check = checkInstallation, audit = () => {} }) {
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const action = req.method + " " + path;
    try {
      if (req.method === "GET" && path === "/health") {
        return reply(res, 200, { status: "ok", service: "github-broker", operations: ["check-installation"] });
      }
      if (req.method !== "POST" || path !== "/check-installation") return reply(res, 404, { error: "Not found" });
      if (busy) return reply(res, 429, { error: "Operation already running" });
      busy = true;
      try {
        const result = await check(config);
        return reply(res, 200, result);
      } finally { busy = false; }
    } catch (e) {
      // Never pass provider error bodies, tokens, key material or stack traces to clients.
      return reply(res, 502, { error: "GitHub installation verification failed" });
    } finally {
      try { audit({ timestamp: new Date().toISOString(), action, elapsedMs: Date.now() - start }); }
      catch { /* no secrets in audit objects */ }
    }
  });
  return server;
}

export function parseBrokerConfig(env = process.env) {
  const appId = env.SOMEWHERE_GITHUB_APP_ID;
  const installationId = env.SOMEWHERE_GITHUB_INSTALLATION_ID;
  const keyPath = env.SOMEWHERE_GITHUB_KEY_PATH;
  const socket = env.SOMEWHERE_GITHUB_BROKER_SOCKET ?? DEFAULT_SOCKET;
  if (!/^\d+$/.test(appId ?? "") || !/^\d+$/.test(installationId ?? "")) {
    throw Error("Missing or invalid GitHub App / Installation ID");
  }
  if (keyPath !== "/etc/somewhere-control/github-app.pem") {
    throw Error("GitHub key must use the approved protected path");
  }
  if (socket !== DEFAULT_SOCKET) throw Error("Refusing unapproved broker socket path");
  return { appId, installationId, keyPath, repository: "Bucifer6/somewhere", socket };
}

export async function startBroker(config) {
  await mkdir(dirname(config.socket), { recursive: true, mode: 0o700 });
  // Prevent accidentally unlinking an unexpected file or an active service.
  try {
    const info = await stat(config.socket);
    if (!info.isSocket()) throw Error("Broker socket path is not a socket");
    throw Error("Broker socket already exists; investigate before restarting");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const server = createBroker({config});
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.socket, resolve);
  });
  await chmod(config.socket, 0o600);
  const cleanup = async () => {
    await new Promise(resolve => server.close(resolve));
    await unlink(config.socket).catch(() => {});
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => cleanup().then(() => process.exit(0)).catch(() => process.exit(1)));
  }
  return server;
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  try {
    const config = parseBrokerConfig();
    await startBroker(config);
    console.error("Somewhere GitHub broker listening on a restricted Unix socket");
  } catch (e) {
    console.error("Broker startup failed:", e.message);
    process.exitCode = 1;
  }
}
