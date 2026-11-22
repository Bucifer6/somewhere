#!/usr/bin/env node
/**
 * Private, authenticated, stateless Streamable HTTP MCP endpoint (JSON responses).
 *
 * By default this server only listens on 127.0.0.1. There is no CORS,
 * no anonymous access, no state-changing tools and no general command runner.
 * An authenticated proxy / proper OAuth resource server is required before
 * a hosted third-party MCP client should be connected.
 */
import http from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { dispatch } from "./mcp.js";

const MAX_BODY = 64 * 1024;
const METHODS = new Set(["POST", "GET", "DELETE"]);

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

function respond(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra
  });
  res.end(JSON.stringify(body));
}

function errorBody(code, message, id = null) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function readJSON(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) {
      const error = new Error("Body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.status = 400;
    throw error;
  }
}

export function createControlServer({ token, allowedOrigins = [], audit = () => {} } = {}) {
  if (typeof token !== "string" || token.length < 32) {
    throw new Error("CONTROL_BEARER_TOKEN must be at least 32 characters");
  }
  const origins = new Set(allowedOrigins.filter(Boolean));
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const finish = (status, action) => {
      try { audit({ timestamp: new Date().toISOString(), action, status, durationMs: Date.now() - started }); }
      catch { /* auditing must not leak secrets into HTTP response */ }
    };
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/mcp" || url.search) {
      finish(404, "not-found");
      return respond(res, 404, { error: "Not found" });
    }
    // An Origin header is not expected from server-to-server MCP clients.
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      finish(403, "origin-denied");
      return respond(res, 403, errorBody(-32000, "Forbidden origin"));
    }
    if (!METHODS.has(req.method)) {
      finish(405, "method-denied");
      return respond(res, 405, errorBody(-32600, "Method not allowed"), { allow: "POST, GET, DELETE" });
    }
    const authorization = req.headers.authorization;
    if (!constantTimeEqual(authorization, "Bearer " + token)) {
      finish(401, "authentication-failed");
      return respond(res, 401, errorBody(-32001, "Unauthorized"), { "www-authenticate": 'Bearer realm="somewhere-control"' });
    }
    // Stateless JSON-only transport; GET event streams are deliberately unsupported.
    if (req.method !== "POST") {
      finish(405, "method-denied");
      return respond(res, 405, errorBody(-32600, "Only POST supported"), { allow: "POST" });
    }
    if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      finish(415, "invalid-content-type");
      return respond(res, 415, errorBody(-32600, "Expected application/json"));
    }
    try {
      const msg = await readJSON(req);
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
        finish(400, "invalid-request");
        return respond(res, 400, errorBody(-32600, "Invalid request"));
      }
      const out = await dispatch(msg);
      finish(200, typeof msg.method === "string" ? msg.method : "unknown");
      // MCP JSON-RPC notifications must not produce JSON-RPC responses.
      if (out === null || msg.id === undefined) {
        res.writeHead(202, { "cache-control": "no-store" });
        return res.end();
      }
      return respond(res, 200, out, { "mcp-protocol-version": "2025-03-26" });
    } catch (error) {
      const status = error.status ?? 500;
      finish(status, "request-error");
      return respond(res, status, errorBody(status === 400 ? -32700 : -32603, status === 413 ? "Request too large" : status === 400 ? "Invalid JSON" : "Internal error"));
    }
  });
}

export function parseControlConfig(env = process.env) {
  const port = Number(env.CONTROL_PORT ?? "3100");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error("Invalid CONTROL_PORT");
  const host = env.CONTROL_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") {
    throw Error("Refusing non-loopback bind; use a separately authenticated proxy");
  }
  const token = env.CONTROL_BEARER_TOKEN;
  if (!token || token.length < 32) throw Error("Set a random CONTROL_BEARER_TOKEN with at least 32 characters");
  return { host, port, token, allowedOrigins: (env.CONTROL_ALLOWED_ORIGINS ?? "").split(",").map(x => x.trim()).filter(Boolean) };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  try {
    const cfg = parseControlConfig();
    const server = createControlServer(cfg);
    server.listen(cfg.port, cfg.host, () => console.error("Somewhere Control MCP bound to loopback on port " + cfg.port));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
