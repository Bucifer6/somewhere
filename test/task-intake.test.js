import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { authorizeLocalAgent, requestDigest, previewIntake, submitReviewedTask } from "../control/task-intake.js";

const request={type:"development-plan",prompt:"Develop an audited plan for fictional inhabitants' relationships."};
const uid=process.getuid();
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),"somewhere-intake-"));
  const state=join(root,"state");
  await mkdir(join(state,"tasks"),{recursive:true,mode:0o700});
  for (const section of ["queued","reserved","completed","failed"]) await mkdir(join(state,"tasks",section),{mode:0o700});
  try {return await fn({home:root,state});} finally {await rm(root,{recursive:true,force:true});}
}
test("review digest is deterministic and binds type and exact canonical prompt",async()=>{
  const a=await previewIntake(request);
  assert.equal(a.digest,requestDigest(request));
  assert.equal(a.approved,false);
  assert.notEqual(requestDigest({...request,prompt:request.prompt+" Again."}),a.digest);
  assert.throws(()=>requestDigest({...request,command:"sh"}),/Unexpected request field/);
});
test("only the unprivileged state owner can submit",()=>{
  assert.throws(()=>authorizeLocalAgent(0,0),/unprivileged/);
  assert.throws(()=>authorizeLocalAgent(1001,1002),/owner/);
  assert.doesNotThrow(()=>authorizeLocalAgent(1001,1001));
});
test("STOP required before any queue mutation",async()=>fixture(async f=>{
  await assert.rejects(()=>submitReviewedTask(request,requestDigest(request),{home:f.home,uid}),/ENOENT|STOP/);
  const items=await import("node:fs/promises").then(fs=>fs.readdir(join(f.state,"tasks","queued")));
  assert.equal(items.length,0);
}));
test("digest mismatch never creates queue records",async()=>fixture(async f=>{
  await writeFile(join(f.state,"STOP"),"",{mode:0o600});
  await assert.rejects(()=>submitReviewedTask(request,"a".repeat(64),{home:f.home,uid}),/mismatch/);
  assert.deepEqual(await import("node:fs/promises").then(fs=>fs.readdir(join(f.state,"tasks","queued"))),[]);
}));
test("valid reviewed intake creates queued task and private audit, never executes",async()=>fixture(async f=>{
  await writeFile(join(f.state,"STOP"),"",{mode:0o600});
  const r=await submitReviewedTask(request,requestDigest(request),{home:f.home,uid});
  assert.equal(r.state,"queued");
  assert.equal(r.attempts,0);
  assert.equal(r.approved,false);
  assert.equal(r.executed,false);
  const task=JSON.parse(await readFile(join(f.state,"tasks","queued",r.taskId+".json"),"utf8"));
  assert.equal(task.prompt,request.prompt);
  const audit=await readFile(join(f.state,"intake-audit.jsonl"),"utf8");
  assert.equal(audit.includes(request.prompt),false);
  assert.match(audit,/intake-requested/);
  assert.match(audit,/intake-created/);
}));
test("existing intake lock blocks concurrent submission fail closed",async()=>fixture(async f=>{
  await writeFile(join(f.state,"STOP"),"",{mode:0o600});
  await writeFile(join(f.state,"intake.lock"),"locked",{mode:0o600});
  await assert.rejects(()=>submitReviewedTask(request,requestDigest(request),{home:f.home,uid}),/EEXIST/);
  assert.deepEqual(await import("node:fs/promises").then(fs=>fs.readdir(join(f.state,"tasks","queued"))),[]);
}));
test("replay of request digest alone cannot authorize execution",async()=>fixture(async f=>{
  await writeFile(join(f.state,"STOP"),"",{mode:0o600});
  const a=await submitReviewedTask(request,requestDigest(request),{home:f.home,uid});
  assert.equal(a.executed,false);
  assert.equal((await import("node:fs/promises").then(fs=>fs.readdir(join(f.state,"tasks","reserved")))).length,0);
}));
