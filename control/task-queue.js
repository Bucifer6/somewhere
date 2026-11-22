import { mkdir, readdir, readFile, writeFile, rename, open } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

export const VALID_TYPES = new Set(["world-story-proposal", "development-plan"]);
export const VALID_STATES = new Set(["queued", "reserved", "completed", "failed"]);
const ID_PATTERN = /^[a-f0-9-]{36}$/i;

export function validateTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Expected task object");
  if (!VALID_TYPES.has(input.type)) throw Error("Unsupported task type");
  if (typeof input.prompt !== "string" || input.prompt.trim().length < 10 || input.prompt.length > 1500) {
    throw Error("Task prompt must be 10-1500 characters");
  }
  return { type: input.type, prompt: input.prompt.trim() };
}

export class TaskQueue {
  constructor(directory) {
    this.directory = resolve(directory);
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const state of VALID_STATES) {
      await mkdir(join(this.directory, state), { recursive: true, mode: 0o700 });
    }
  }
  location(state, id) {
    if (!VALID_STATES.has(state) || !ID_PATTERN.test(id)) throw Error("Invalid task location");
    return join(this.directory, state, id + ".json");
  }
  async enqueue(input, now = new Date()) {
    const task = validateTask(input);
    await this.initialize();
    const id = randomUUID();
    const payload = { id, ...task, state: "queued", createdAt: now.toISOString(), updatedAt: now.toISOString(), attempts: 0 };
    await writeFile(this.location("queued", id), JSON.stringify(payload, null, 2), { flag: "wx", mode: 0o600 });
    return payload;
  }
  async list(state = "queued") {
    await this.initialize();
    if (!VALID_STATES.has(state)) throw Error("Invalid state");
    const names = (await readdir(join(this.directory, state))).filter(n => /^[a-f0-9-]{36}\.json$/i.test(n)).sort();
    return Promise.all(names.map(n => readFile(join(this.directory, state, n), "utf8").then(JSON.parse)));
  }
  async reserve() {
    await this.initialize();
    const tasks = await this.list("queued");
    for (const task of tasks) {
      const from = this.location("queued", task.id);
      const to = this.location("reserved", task.id);
      // Reserve using an exclusive lock file; only the winner may rename the queued task.
      const lock = to + ".lock";
      let handle;
      try {
        handle = await open(lock, "wx", 0o600);
      } catch (error) {
        if (error.code === "EEXIST") continue;
        throw error;
      }
      try {
        const payload = JSON.parse(await readFile(from, "utf8"));
        await rename(from, to);
        payload.state = "reserved";
        payload.attempts += 1;
        payload.updatedAt = new Date().toISOString();
        await writeFile(to, JSON.stringify(payload, null, 2), { mode: 0o600 });
        return payload;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      } finally {
        await handle.close();
        await import("node:fs/promises").then(fs => fs.unlink(lock)).catch(() => {});
      }
    }
    return null;
  }
  async finish(id, state, details = {}) {
    if (state !== "completed" && state !== "failed") throw Error("Invalid final state");
    const from = this.location("reserved", id);
    const payload = JSON.parse(await readFile(from, "utf8"));
    const result = { ...payload, state, updatedAt: new Date().toISOString(), ...details };
    await writeFile(from, JSON.stringify(result, null, 2), { mode: 0o600 });
    await rename(from, this.location(state, id));
    return result;
  }
}
