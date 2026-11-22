import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskQueue } from "../control/task-queue.js";
import { inspectSupervised, rehearseTask } from "../control/supervisor.js";

async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),"somewhere-supervisor-test-"));
  const queue=new TaskQueue(join(dir,"live-queue"));
  const stopPath=join(dir,"STOP");
  try {return await fn({queue,stopPath});}
  finally {await rm(dir,{recursive:true,force:true});}
}

test("preview shows metadata but never enables paid execution",()=>fixture(async ({queue,stopPath})=>{
  await queue.enqueue({type:"development-plan",prompt:"Create a plan for Hearth relationships and lasting memories."});
  const result=await inspectSupervised({queue,stopPath});
  assert.equal(result.mode,"preview-only");
  assert.equal(result.stopEngaged,false);
  assert.equal(result.canRunPaidTask,false);
  assert.equal(result.queuedCount,1);
  assert.match(result.nextTask.promptPreview,/lasting memories/);
}));

test("rehearsal refuses to run unless STOP is engaged",()=>fixture(async ({queue,stopPath})=>{
  await queue.enqueue({type:"development-plan",prompt:"Create a plan for Hearth relationships and lasting memories."});
  await assert.rejects(()=>rehearseTask({queue,stopPath}),/engaged emergency STOP/);
  assert.equal((await queue.list("queued")).length,1);
}));

test("rehearsal exercises mock proposal, budget and audit without consuming queued task",()=>fixture(async ({queue,stopPath})=>{
  const task=await queue.enqueue({type:"development-plan",prompt:"Create a plan for Hearth relationships and lasting memories."});
  await writeFile(stopPath,"");
  const result=await rehearseTask({queue,stopPath});
  assert.equal(result.status,"completed");
  assert.equal(result.simulated,true);
  assert.equal(result.originalTask.taskId,task.id);
  assert.equal(result.simulatedLedger.callsToday,1);
  assert.equal(result.simulatedLedger.unsettled,0);
  assert.ok(result.auditEvents.includes("budget-reserved"));
  assert.match(result.generatedPreview,/SIMULATED development proposal/);
  assert.equal((await queue.list("queued"))[0].id,task.id);
  assert.equal((await queue.list("completed")).length,0);
}));

test("rehearsal of empty queue is safe and does not issue work",()=>fixture(async ({queue,stopPath})=>{
  await writeFile(stopPath,"");
  assert.deepEqual(await rehearseTask({queue,stopPath}),{status:"empty",simulated:true});
}));
