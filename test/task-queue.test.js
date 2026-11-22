import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskQueue } from "../control/task-queue.js";
import { runOnce, isEnabled } from "../control/agent-scheduler.js";

async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),"somewhere-queue-"));
  try {return await fn(new TaskQueue(join(dir,"tasks")),join(dir,"results"));}
  finally {await rm(dir,{recursive:true,force:true});}
}

test("tasks use an allowlisted type and bounded prompt",async()=>fixture(async q=>{
  await assert.rejects(()=>q.enqueue({type:"shell-command",prompt:"delete everything"}),/Unsupported/);
  await assert.rejects(()=>q.enqueue({type:"development-plan",prompt:"short"}),/10-1500/);
  const task=await q.enqueue({type:"development-plan",prompt:"Create a plan for better world history."});
  assert.equal(task.state,"queued");
}));

test("task reserve and completion preserve identifiers",async()=>fixture(async q=>{
  const a=await q.enqueue({type:"world-story-proposal",prompt:"Write a harmless morning scene."});
  const b=await q.reserve();
  assert.equal(a.id,b.id);
  assert.equal(b.attempts,1);
  await q.finish(a.id,"completed",{outputFile:"sample.txt"});
  assert.equal((await q.list("completed"))[0].outputFile,"sample.txt");
  assert.equal((await q.list("queued")).length,0);
}));

test("disabled scheduler does not dequeue or invoke AI",async()=>fixture(async(q,out)=>{
  await q.enqueue({type:"development-plan",prompt:"Make a plan for a moonlit grove."});
  const events=[];
  let calls=0;
  const state=await runOnce({
    queue:q,
    config:{enabled:"false",apiKey:"example",maxCalls:1,maxOutputTokens:200},
    propose:async()=>{calls++;return "proposal";},
    audit:async x=>events.push(x),
    isStopped:async()=>false,
    outputDir:out
  });
  assert.equal(state,"disabled");
  assert.equal(calls,0);
  assert.equal((await q.list("queued")).length,1);
  assert.equal(events[0].event,"disabled");
}));

test("emergency stop blocks work before task reservation",async()=>fixture(async(q,out)=>{
  const task=await q.enqueue({type:"world-story-proposal",prompt:"Describe a quiet village dawn."});
  const result=await runOnce({queue:q,config:{enabled:"true",apiKey:"example",maxCalls:1,maxOutputTokens:50},isStopped:async()=>true,audit:async()=>{},propose:async()=>{throw Error("should not run");},outputDir:out});
  assert.equal(result,"stopped");
  assert.equal((await q.list("queued"))[0].id,task.id);
}));

test("enabled planner with injected provider creates proposal and audit",async()=>fixture(async(q,out)=>{
  await q.enqueue({type:"development-plan",prompt:"Draft a plan for safe tree growth simulation."});
  const events=[];
  const result=await runOnce({queue:q,config:{enabled:"true",apiKey:"example",maxCalls:1,maxOutputTokens:100},audit:async e=>events.push(e),isStopped:async()=>false,propose:async()=> "A reviewed plan.",outputDir:out});
  assert.equal(result,"completed");
  assert.equal((await q.list("completed")).length,1);
  assert.ok(events.some(x=>x.event==="task-completed"));
}));

test("zero or missing quotas block API use",()=>{
  assert.equal(isEnabled({enabled:"true",apiKey:"example",maxCalls:0,maxOutputTokens:100}),false);
  assert.equal(isEnabled({enabled:"true",apiKey:null,maxCalls:1,maxOutputTokens:100}),false);
});
