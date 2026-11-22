// Control 2.1: local operator-gated task intake. Never exported over MCP.
// No worker execution, approval issuance, paid calls, GitHub writes or deployments.
import { createHash, randomUUID } from "node:crypto";
import { open, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { TaskQueue, validateTask } from "./task-queue.js";

const MAX_QUEUED = 20;
const MAX_AUDIT_BYTES = 1024 * 1024;
const IDENTIFIER = /^[0-9a-f-]{36}$/i;

export function requestDigest(input) {
  const task = validateTask(input);
  if (Object.keys(input).some(key => !["type", "prompt"].includes(key))) throw Error("Unexpected request field");
  return createHash("sha256").update(JSON.stringify({version:1,kind:"queued-proposal-only",...task})).digest("hex");
}
export function authorizeLocalAgent(uid, owner) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || uid !== owner) {
    throw Error("Only the unprivileged agent-state owner may submit tasks");
  }
}
async function checkDirectory(path, uid) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077) !== 0) {
    throw Error("Private agent state directory required");
  }
}
async function requireStop(stopPath, owner) {
  const stat = await lstat(stopPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.uid !== owner && stat.uid !== 0) ||
      (stat.mode & 0o077) !== 0) throw Error("STOP missing or unsafe");
}
async function appendAudit(directory, record) {
  const file = join(directory, "intake-audit.jsonl");
  let prior;
  try {
    prior = await lstat(file);
    if (!prior.isFile() || prior.isSymbolicLink() || prior.uid !== process.getuid() ||
        (prior.mode & 0o077) !== 0 || prior.size >= MAX_AUDIT_BYTES) throw Error("Unsafe or full intake audit");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const fd = await open(file, "a", 0o600);
  try {
    await fd.writeFile(JSON.stringify(record) + "\n");
    await fd.sync();
  } finally { await fd.close(); }
}
export async function submitReviewedTask(input, digest, {
  home = "/var/lib/somewhere-agent",
  uid = process.getuid?.(),
  now = new Date()
} = {}) {
  if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw Error("Full SHA-256 review digest required");
  if (requestDigest(input) !== digest) throw Error("Review digest mismatch; do not submit");
  const state = join(home, "state");
  const stat = await lstat(state);
  authorizeLocalAgent(uid, stat.uid);
  await checkDirectory(state, uid);
  await requireStop(join(state, "STOP"), uid);
  const directory = join(state, "tasks");
  await checkDirectory(directory, uid);
  const queue = new TaskQueue(directory);
  const lock = join(state, "intake.lock");
  // O_EXCL serialises concurrent intake; stale locks fail closed for human review.
  const lockFd = await open(lock, "wx", 0o600);
  try {
    await lockFd.sync();
    await requireStop(join(state, "STOP"), uid);
    const queued = await queue.list("queued");
    if (queued.length >= MAX_QUEUED) throw Error("Queue at safe intake limit");
    const requestId = randomUUID();
    const at = now.toISOString();
    const record = {version:1,requestId,event:"intake-requested",at,type:input.type,digest};
    // A durable intent precedes any queue mutation; no prompts or keys in audit.
    await appendAudit(state, record);
    await requireStop(join(state, "STOP"), uid);
    const task = await queue.enqueue(validateTask(input), now);
    await appendAudit(state, {version:1,requestId,event:"intake-created",at:new Date().toISOString(),taskId:task.id,digest});
    return {requestId,taskId:task.id,type:task.type,state:task.state,attempts:task.attempts,approved:false,executed:false};
  } finally {
    await lockFd.close();
    await unlink(lock);
  }
}
export async function previewIntake(input) {
  return {kind:"queued-proposal-only",type:validateTask(input).type,digest:requestDigest(input),approved:false,executed:false,
    note:"A separately reviewed, exact SHA-256 digest is required for local submission; approvals and execution remain separate."};
}
