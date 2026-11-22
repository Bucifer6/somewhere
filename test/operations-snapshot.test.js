import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { operationsSnapshot } from "../control/operations-snapshot.js";

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "somewhere-ops-"));
  const home = join(root, "agent");
  const approvals = join(root, "approvals");
  const tasks = join(home, "state", "tasks");
  try {
    await mkdir(tasks, {recursive:true,mode:0o700});
    await mkdir(approvals,{mode:0o700});
    for (const state of ["queued","reserved","completed","failed"]) await mkdir(join(tasks,state),{mode:0o700});
    await fn({home,approvals,tasks});
  } finally { await rm(root,{recursive:true,force:true}); }
}
const healthy = async () => ({ok:true,json:async()=>({status:"ok",tick:17})});

test("offline report reads queue metadata and STOP without exposing prompts",async()=>fixture(async f=>{
  await writeFile(join(f.home,"state","STOP"),"stopped",{mode:0o600});
  const id=randomUUID();
  await writeFile(join(f.tasks,"queued",id+".json"),
    JSON.stringify({id,type:"development-plan",state:"queued",prompt:"sensitive operator prompt",attempts:0,updatedAt:"2026-11-22T00:00:00Z"}),{mode:0o600});
  const result=await operationsSnapshot({...f,fetchWorld:healthy});
  assert.equal(result.stop,"engaged");
  assert.equal(result.tasks.queued.count,1);
  assert.equal(result.liveWorldHealth.status,"healthy");
  assert.equal(result.deployment.verified,false);
  assert.equal(result.capabilities.mcpTaskWrites,false);
  assert.equal(JSON.stringify(result).includes("sensitive operator prompt"),false);
}));

test("missing STOP does not get reported as engaged",async()=>fixture(async f=>{
  const r=await operationsSnapshot({...f,fetchWorld:healthy});
  assert.equal(r.stop,"absent-warning");
  assert.equal(r.capabilities.paidCalls,false);
}));

test("unreadable or invalid task data fail closed without exposing content",async()=>fixture(async f=>{
  const id=randomUUID();
  await writeFile(join(f.tasks,"queued",id+".json"),"private invalid content",{mode:0o600});
  const r=await operationsSnapshot({...f,fetchWorld:healthy});
  assert.equal(r.tasks.queued.status,"unavailable-fail-closed");
  assert.equal(JSON.stringify(r).includes("private invalid content"),false);
}));

test("directory writable by others is rejected",async()=>fixture(async f=>{
  await chmod(join(f.tasks,"queued"),0o777);
  const r=await operationsSnapshot({...f,fetchWorld:healthy});
  assert.equal(r.tasks.queued.status,"unavailable-fail-closed");
}));

test("offline snapshot forbids non-loopback world URL",async()=>fixture(async f=>{
  await assert.rejects(operationsSnapshot({...f,worldUrl:"https://example.com",fetchWorld:healthy}),/loopback/);
}));

test("world failure cannot be mistaken for deployment verification",async()=>fixture(async f=>{
  const r=await operationsSnapshot({...f,fetchWorld:async()=>{throw Error("offline")}});
  assert.equal(r.liveWorldHealth.status,"unavailable");
  assert.equal(r.deployment.verified,false);
}));

import { authorizeSnapshotIdentity } from "../control/operations-cli.js";

test("private agent owner can read status without root capabilities", () => {
  assert.equal(authorizeSnapshotIdentity(998,998,998), "agent-owner-read-only");
  assert.equal(authorizeSnapshotIdentity(0,998,998), "root-operator");
});

test("a non-owner or mismatched state owner is denied", () => {
  assert.throws(() => authorizeSnapshotIdentity(999,998,998), /Operator-only/);
  assert.throws(() => authorizeSnapshotIdentity(998,998,999), /Operator-only/);
  assert.throws(() => authorizeSnapshotIdentity(-1,998,998), /Invalid execution UID/);
});
