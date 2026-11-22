import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskQueue } from "../control/task-queue.js";
import { UsageLedger } from "../control/usage-ledger.js";
import { runOnce } from "../control/agent-scheduler.js";

const config={enabled:"true",apiKey:"test-only-not-a-secret",maxCalls:1,maxOutputTokens:120};
const policy={enabled:true,maxCallsPerDay:1,maxCallsPerMonth:1,maxEstimatedUsdPerMonth:2,worstCaseUsdPerCall:2};
async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),"somewhere-07-"));
  const queue=new TaskQueue(join(dir,"tasks"));
  const ledger=new UsageLedger(join(dir,"ledger"));
  try {return await fn({queue,ledger,outputDir:join(dir,"out")});}
  finally {await rm(dir,{recursive:true,force:true});}
}

test("paid execution refuses to reserve a task without durable ledger",()=>fixture(async ({queue,outputDir})=>{
  await queue.enqueue({type:"development-plan",prompt:"Plan a village relationship system"});
  let calls=0;
  const result=await runOnce({queue,config,propose:async()=>{calls++;return "never";},isStopped:async()=>false,audit:async()=>{},outputDir});
  assert.equal(result,"budget-unconfigured");
  assert.equal(calls,0);
  assert.equal((await queue.list("queued")).length,1);
}));

test("live ledger reserves before mocked provider and retains usage after success",()=>fixture(async ({queue,ledger,outputDir})=>{
  await queue.enqueue({type:"development-plan",prompt:"Plan the inhabitants memory model"});
  let calls=0;
  const result=await runOnce({queue,ledger,budgetPolicy:policy,config,isStopped:async()=>false,audit:async()=>{},
    outputDir,propose:async()=>{
      calls++;
      assert.equal((await ledger.status()).callsToday,1);
      return "A safe planning document";
    }});
  assert.equal(result,"completed");
  assert.equal(calls,1);
  assert.equal((await ledger.status()).unsettled,0);
  assert.equal((await queue.list("completed")).length,1);
  assert.match(await readFile(join(outputDir,(await queue.list("completed"))[0].outputFile),"utf8"),/planning document/);
}));

test("failed provider consumes reservation and task cannot be automatically retried",()=>fixture(async ({queue,ledger,outputDir})=>{
  await queue.enqueue({type:"development-plan",prompt:"Plan forest ecology in Hearth"});
  let calls=0;
  await assert.rejects(()=>runOnce({queue,ledger,budgetPolicy:policy,config,
    isStopped:async()=>false,audit:async()=>{},outputDir,propose:async()=>{calls++;throw Error("simulated failure");}}),/simulated failure/);
  assert.equal(calls,1);
  assert.equal((await ledger.status()).callsThisMonth,1);
  assert.equal((await queue.list("failed")).length,1);
  await queue.enqueue({type:"development-plan",prompt:"Plan villagers memory choices"});
  const status=await runOnce({queue,ledger,budgetPolicy:policy,config,
    isStopped:async()=>false,audit:async()=>{},outputDir,propose:async()=>{calls++;return "unexpected";}});
  assert.equal(status,"quota-exhausted");
  assert.equal(calls,1);
}));

test("emergency STOP after budget reservation blocks provider and does not refund",()=>fixture(async ({queue,ledger,outputDir})=>{
  await queue.enqueue({type:"world-story-proposal",prompt:"Imagine the sunrise over Hearth"});
  let inspections=0;
  let calls=0;
  const result=await runOnce({queue,ledger,budgetPolicy:policy,config,audit:async()=>{},outputDir,
    isStopped:async()=>++inspections>=3,
    propose:async()=>{calls++;return "never";}});
  assert.equal(result,"stopped");
  assert.equal(calls,0);
  assert.equal((await ledger.status()).callsToday,1);
  assert.equal((await queue.list("failed")).length,1);
}));

test("disabled budget never permits provider call",()=>fixture(async ({queue,ledger,outputDir})=>{
  await queue.enqueue({type:"development-plan",prompt:"Plan a garden for the settlers"});
  let calls=0;
  const result=await runOnce({queue,ledger,budgetPolicy:{...policy,enabled:false},config,audit:async()=>{},outputDir,
    isStopped:async()=>false,propose:async()=>{calls++;return "never";}});
  assert.equal(result,"quota-exhausted");
  assert.equal(calls,0);
  assert.equal((await ledger.status()).callsToday,0);
}));
