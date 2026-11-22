import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { taskFingerprint, reviewPacket, approvalFor, validateApproval, assertStopFile, writePrivateApproval } from "../control/approval-gate.js";

const task={id:"f502b8fd-8f1c-4699-84e3-765859892db9",type:"development-plan",state:"queued",prompt:"Design persistent memories for the eight inhabitants of Hearth."};
const now=new Date("2026-11-22T14:00:00Z");
test("review packet binds task, repository, and review window",()=>{
  const p=reviewPacket(task,now);
  assert.match(p.taskSha256,/^[0-9a-f]{64}$/);
  assert.equal(p.repository,"Bucifer6/somewhere");
  assert.equal(p.maxProviderCalls,1);
  assert.equal(p.automaticGitHubWrites,false);
  assert.equal(new Date(p.expiresAt).getTime()-now.getTime(),15*60*1000);
  assert.equal(taskFingerprint({...task}),p.taskSha256);
});
test("approval rejects tampering, expired window and changed task",()=>{
  const p=reviewPacket(task,now);
  const a=approvalFor(p,task,now);
  assert.equal(validateApproval(p,a,task,now),true);
  assert.throws(()=>validateApproval(p,a,{...task,prompt:task.prompt+" changed"},now),/changed/);
  assert.throws(()=>validateApproval(p,{...a,taskSha256:"0".repeat(64)},task,now),/mismatch/);
  assert.throws(()=>validateApproval(p,a,task,new Date("2026-11-22T14:15:00Z")),/expired/);
  assert.throws(()=>validateApproval({...p,automaticGitHubWrites:true},a,task,now),/Invalid review/);
});
test("invalid or non-queued tasks cannot be reviewed",()=>{
  assert.throws(()=>reviewPacket({...task,state:"reserved"},now),/Invalid queued/);
  assert.throws(()=>reviewPacket({...task,id:"../../x"},now),/Invalid queued/);
});
test("STOP file must exist for review and approval operations",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"somewhere-stop-"));
  try {
    await assert.rejects(()=>assertStopFile(join(dir,"STOP")),{code:"ENOENT"});
    await writeFile(join(dir,"STOP"),"");
    assert.equal(await assertStopFile(join(dir,"STOP")),true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("approval writer cannot target arbitrary directories",async()=>{
  await assert.rejects(()=>writePrivateApproval({approvalId:"x"},"/tmp"),/Unapproved output/);
});
