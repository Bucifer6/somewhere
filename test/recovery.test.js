import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskQueue } from "../control/task-queue.js";
import { inspectReserved,failAbandonedTasks } from "../control/recovery.js";

async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),"somewhere-recovery-"));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test("manual recovery requires STOP plus exact acknowledgement",()=>fixture(async dir=>{
  const queue=new TaskQueue(join(dir,"tasks"));
  await queue.enqueue({type:"development-plan",prompt:"Write a plan for expanded world ecology."});
  const task=await queue.reserve();
  assert.equal((await inspectReserved(queue)).length,1);
  await assert.rejects(()=>failAbandonedTasks({queue,stopFile:join(dir,"STOP"),acknowledge:"yes"}),/acknowledgement/);
  await assert.rejects(()=>failAbandonedTasks({queue,stopFile:join(dir,"STOP"),acknowledge:"I_CONFIRMED_ALL_WORKERS_STOPPED"}),/STOP/);
  await writeFile(join(dir,"STOP"),"");
  const events=[];
  const result=await failAbandonedTasks({queue,stopFile:join(dir,"STOP"),acknowledge:"I_CONFIRMED_ALL_WORKERS_STOPPED",audit:async e=>events.push(e)});
  assert.deepEqual(result,[task.id]);
  assert.equal((await queue.list("failed")).length,1);
  assert.equal((await queue.list("queued")).length,0);
  assert.equal(events.length,1);
}));
