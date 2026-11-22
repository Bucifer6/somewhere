import http from "node:http";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { initialWorld, advanceWorld } from "./world.js";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = resolve(process.env.DATA_DIR ?? "./data");
const PUBLIC_DIR = resolve("./public");
const TICK_MS = 60_000;
const STATE_FILE = join(DATA_DIR, "world.json");
let world;
let busy = false;

async function saveWorld() {
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = STATE_FILE + ".tmp";
  await writeFile(temporary, JSON.stringify(world, null, 2));
  await rename(temporary, STATE_FILE);
}

async function loadWorld() {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (!state || state.version !== 1 || !Array.isArray(state.inhabitants) || !Array.isArray(state.events)) throw new Error("Invalid world state");
    return state;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return initialWorld();
  }
}

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
async function serveStatic(req, res, path) {
  const target = resolve(PUBLIC_DIR, "." + path);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) return json(res, 403, { error: "Forbidden" });
  try {
    const content = await readFile(target);
    res.writeHead(200, { "content-type": types[extname(target)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    json(res, error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500, { error: "Not found" });
  }
}

async function main() {
  world = await loadWorld();
  await saveWorld();
  const server = http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/api/health") return json(res, 200, { status: "ok", tick: world.tick });
      if (path === "/api/world") return json(res, 200, world);
      await serveStatic(req, res, path === "/" ? "/index.html" : path);
    } catch (error) {
      console.error(error);
      json(res, 500, { error: "Internal server error" });
    }
  });
  server.listen(PORT, "0.0.0.0", () => console.log(`Somewhere listening on :${PORT}`));
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const next = advanceWorld(world);
      const previous = world;
      world = next;
      try { await saveWorld(); } catch (error) { world = previous; throw error; }
    } catch (error) {
      console.error("Simulation step failed", error);
    } finally {
      busy = false;
    }
  }, TICK_MS);
}
main().catch(error => { console.error(error); process.exit(1); });
