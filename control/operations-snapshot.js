// Control 2.0: offline, read-only operator snapshot. No MCP export or execution.
// All paths are operator-owned defaults; dependency injection exists for tests only.
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const STATES = ["queued", "reserved", "completed", "failed"];
const TASK_FILE = /^[a-f0-9-]{36}\.json$/i;
const APPROVAL_FILE = /^[a-f0-9-]{36}\.json$/i;
const MAX_ENTRIES = 250;
const LIMIT_MS = 5000;

async function privateDirectory(path) {
  const s = await lstat(path);
  if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o022) !== 0) {
    throw Error("Unsafe operator directory");
  }
  return s;
}
async function limitedNames(path, pattern) {
  await privateDirectory(path);
  const entries = await readdir(path);
  if (entries.length > MAX_ENTRIES) throw Error("Too many entries; use offline review");
  return entries.filter(name => pattern.test(name)).sort();
}
async function stopState(path) {
  try {
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink()) return "invalid-fail-closed";
    return "engaged";
  } catch (error) {
    if (error.code === "ENOENT") return "absent-warning";
    return "unavailable-fail-closed";
  }
}
async function queueSummary(directory) {
  const summary = {};
  for (const state of STATES) {
    try {
      const path = join(directory, state);
      const names = await limitedNames(path, TASK_FILE);
      // Do not read prompts. Only report strictly allowlisted metadata.
      const tasks = [];
      for (const name of names) {
        const file = join(path, name);
        const stat = await lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
          throw Error("Unsafe task file");
        }
        const task = JSON.parse(await readFile(file, "utf8"));
        if (task.id + ".json" !== name || task.state !== state ||
            !["development-plan", "world-story-proposal"].includes(task.type)) throw Error("Invalid task record");
        tasks.push({id: task.id, type: task.type, state, attempts: task.attempts, updatedAt: task.updatedAt});
      }
      summary[state] = { count: tasks.length, tasks: tasks.slice(0, 20), truncated: tasks.length > 20 };
    } catch (error) {
      summary[state] = { status: "unavailable-fail-closed", reason: error.code === "ENOENT" ? "missing" : "invalid-or-inaccessible" };
    }
  }
  return summary;
}
async function approvalSummary(directory) {
  try {
    const names = await limitedNames(directory, APPROVAL_FILE);
    // Never read approval contents or list approval identifiers.
    return { count: names.length, note: "Presence does not establish validity, freshness or consent" };
  } catch (error) {
    return { status: "unavailable-fail-closed", reason: error.code === "ENOENT" ? "missing" : "invalid-or-inaccessible" };
  }
}
export async function operationsSnapshot({
  home = "/var/lib/somewhere-agent",
  approvals = "/root/somewhere-approvals",
  worldUrl = "http://127.0.0.1:3000",
  fetchWorld = fetch
} = {}) {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(worldUrl)) throw Error("World URL must be explicit loopback");
  const stop = await stopState(join(home, "state", "STOP"));
  const [tasks, approvalRecords] = await Promise.all([
    queueSummary(join(home, "state", "tasks")),
    approvalSummary(approvals)
  ]);
  let health = { status: "unavailable" };
  try {
    const response = await fetchWorld(worldUrl + "/api/health", { signal: AbortSignal.timeout(LIMIT_MS) });
    if (!response.ok) throw Error("HTTP unavailable");
    const body = await response.json();
    health = { status: body.status === "ok" && Number.isSafeInteger(body.tick) ? "healthy" : "invalid", tick: Number.isSafeInteger(body.tick) ? body.tick : null };
  } catch {
    health = { status: "unavailable" };
  }
  return {
    schemaVersion: 1,
    mode: "operator-read-only",
    stop,
    tasks,
    approvalRecords,
    liveWorldHealth: health,
    deployment: {
      verified: false,
      reason: "World API health does not prove the deployed source commit, image digest or rollback readiness",
      requires: ["independently recorded revision and container image digest", "health check", "rollback rehearsal"]
    },
    capabilities: { mcpTaskWrites: false, mcpApprovals: false, mcpDeployments: false, paidCalls: false, stopOverride: false }
  };
}
