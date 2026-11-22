// Control 0.8: a reproducible, network-free rehearsal of the first queued task.
// The real queue, STOP file and API credentials are never modified or used.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TaskQueue } from "./task-queue.js";
import { UsageLedger } from "./usage-ledger.js";
import { runOnce } from "./agent-scheduler.js";

const MAX_PREVIEW_CHARS = 160;
export const REHEARSAL_POLICY = Object.freeze({
  enabled: true,
  maxCallsPerDay: 1,
  maxCallsPerMonth: 1,
  maxEstimatedUsdPerMonth: 1,
  worstCaseUsdPerCall: 1
});

export function taskMetadata(task) {
  if (!task || typeof task !== "object") throw Error("Invalid task");
  return {
    taskId: task.id,
    type: task.type,
    state: task.state,
    promptPreview: String(task.prompt ?? "").slice(0, MAX_PREVIEW_CHARS)
  };
}

export function mockDevelopmentResponse(task) {
  // Deterministic, harmless example output. Does not invoke any AI provider.
  return [
    "# Supervised rehearsal: " + task.type,
    "",
    "This is a SIMULATED development proposal; it was not produced by an AI model.",
    "Task ID: " + task.id,
    "",
    "Proposed review gates:",
    "1. Model inhabitant memories and relationships with a versioned schema.",
    "2. Test migration from the existing Genesis 0.2 world state.",
    "3. Verify deterministic simulation and preservation of player-visible history.",
    "4. Submit changes through a protected pull request; never deploy automatically."
  ].join("\n");
}

export async function inspectSupervised({ queue, stopPath, ledger }) {
  const queued = await queue.list("queued");
  let stopped = false;
  try { await readFile(stopPath); stopped = true; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const result = {
    mode: "preview-only",
    stopEngaged: stopped,
    nextTask: queued.length ? taskMetadata(queued[0]) : null,
    queuedCount: queued.length,
    canRunPaidTask: false
  };
  if (ledger) {
    try { result.budget = await ledger.status(); }
    catch { result.budget = { status: "unavailable-fail-closed" }; }
  }
  return result;
}

export async function rehearseTask({ queue, stopPath }) {
  const preview = await inspectSupervised({queue,stopPath});
  if (!preview.stopEngaged) throw Error("Rehearsal requires an engaged emergency STOP");
  if (!preview.nextTask) return { status: "empty", simulated: true };
  const source = (await queue.list("queued")).find(t => t.id === preview.nextTask.taskId);
  if (!source) throw Error("Queued task changed; aborting rehearsal");

  const scratch = await mkdtemp(join(tmpdir(),"somewhere-rehearsal-"));
  try {
    const isolatedQueue = new TaskQueue(join(scratch,"tasks"));
    const ledger = new UsageLedger(join(scratch,"ledger"));
    const simulated = await isolatedQueue.enqueue({type:source.type,prompt:source.prompt});
    const events = [];
    const result = await runOnce({
      queue:isolatedQueue,
      ledger,
      budgetPolicy:REHEARSAL_POLICY,
      config:{enabled:"true",apiKey:"offline-simulation-only",maxCalls:1,maxOutputTokens:200},
      propose:async task => mockDevelopmentResponse(task),
      audit:async event => events.push(event.event),
      isStopped:async()=>false, // STOP applies to production queue; scratch run is safe and offline.
      outputDir:join(scratch,"proposals")
    });
    const outcome=(await isolatedQueue.list("completed"))[0];
    const text = await readFile(join(scratch,"proposals",outcome.outputFile),"utf8");
    return {
      status:result,
      simulated:true,
      originalTask:taskMetadata(source),
      scratchTaskId:simulated.id,
      simulatedLedger:await ledger.status(),
      auditEvents:events,
      generatedPreview:text
    };
  } finally {
    await rm(scratch,{recursive:true,force:true});
  }
}
