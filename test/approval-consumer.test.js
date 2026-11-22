import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskQueue } from "../control/task-queue.js";
import { reviewPacket, approvalFor } from "../control/approval-gate.js";
import { ApprovalConsumer, validateApprovalBundle, readApprovalBundle } from "../control/approval-consumer.js";
import { runApprovedOffline,oneShotPreview } from "../control/one-shot.js";

async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),"somewhere-10-"));
  const queue=new TaskQueue(join(dir,"tasks")),stopPath=join(dir,"STOP");
  const now=new Date("2026-11-22T14:00:00Z");
  const task=await queue.enqueue({type:"development-plan",prompt:"Design long-term relationships for Hearth inhabitants."});
  const packet=reviewPacket(task,now),approval=approvalFor(packet,task,now);
  const bundle={packet,approval};
  try {return await fn({dir,queue,stopPath,task,bundle,now});}
  finally {await rm(dir,{recursive:true,force:true});}
}
test("single-use approval cannot be replayed even concurrently",()=>fixture(async ({dir,task,bundle,now})=>{
  const consumer=new ApprovalConsumer(join(dir,"consumed"));
  const results=await Promise.allSettled(Array.from({length:5},()=>consumer.consume(bundle,task,now)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.filter(r=>r.status==="rejected").length,4);
  assert.equal(JSON.parse(await readFile(join(dir,"consumed",bundle.approval.approvalId+".consumed"),"utf8")).taskId,task.id);
}));
test("approval cannot be consumed for a changed or expired task",()=>fixture(async ({dir,task,bundle,now})=>{
  const c=new ApprovalConsumer(join(dir,"consumed"));
  await assert.rejects(()=>c.consume(bundle,{...task,prompt:task.prompt+" tampered"},now),/changed/);
  await assert.rejects(()=>c.consume(bundle,task,new Date("2026-11-22T14:15:00Z")),/expired/);
}));
test("operator preview requires STOP and leaves queue unchanged",()=>fixture(async ({queue,stopPath,bundle,task,now})=>{
  await assert.rejects(()=>oneShotPreview({queue,stopPath,bundle,now}),{code:"ENOENT"});
  await writeFile(stopPath,"");
  const preview=await oneShotPreview({queue,stopPath,bundle,now});
  assert.equal(preview.mode,"offline-only");
  assert.equal((await queue.list("queued"))[0].id,task.id);
}));
test("offline single-shot consumes approval before mock provider, never touches live queue",()=>fixture(async ({dir,queue,stopPath,bundle,task,now})=>{
  await writeFile(stopPath,"");
  const consumer=new ApprovalConsumer(join(dir,"consumed"));
  let invoked=0;
  const out=join(dir,"output");
  const result=await runApprovedOffline({queue,stopPath,bundle,consumer,outputDir:out,now,
    provider:async()=>{invoked++;return "SIMULATED SAFE PROPOSAL";}});
  assert.equal(result.status,"completed");
  assert.equal(result.paidProviderCalls,0);
  assert.equal(invoked,1);
  assert.equal((await queue.list("queued"))[0].id,task.id);
  await assert.rejects(()=>runApprovedOffline({queue,stopPath,bundle,consumer,outputDir:out,now,provider:async()=>{invoked++;return "NOT CALLED";}}),{code:"EEXIST"});
  assert.equal(invoked,1);
}));
test("failed offline provider still burns approval",()=>fixture(async ({dir,queue,stopPath,bundle,now})=>{
  await writeFile(stopPath,"");
  const consumer=new ApprovalConsumer(join(dir,"consumed"));
  await assert.rejects(()=>runApprovedOffline({queue,stopPath,bundle,consumer,outputDir:join(dir,"output"),now,provider:async()=>{throw Error("crash");}}),/crash/);
  await assert.rejects(()=>runApprovedOffline({queue,stopPath,bundle,consumer,outputDir:join(dir,"output"),now}),{code:"EEXIST"});
}));
test("approval reader disallows paths outside private directory",async()=>{
  await assert.rejects(()=>readApprovalBundle("/tmp/anything.json"),/Unapproved approval/);
});
