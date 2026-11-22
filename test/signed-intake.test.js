import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalAuthorization, verifySignedRequest, submitSignedTask } from "../control/signed-intake.js";
import { requestDigest } from "../control/task-intake.js";

const input={type:"development-plan",prompt:"Develop a safe proposal for fictional village interactions."};
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const keys={"operator-test":publicKey.export({type:"spki",format:"pem"})};
const uid=process.getuid();

function signed(now=new Date()) {
  const payload={version:1,audience:"somewhere-control-2.3",operation:"enqueue-proposal-only",
    operator:"operator-test",nonce:randomUUID(),digest:requestDigest(input),
    issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+180000).toISOString()};
  const signature=sign(null,Buffer.from(canonicalAuthorization(payload)),privateKey).toString("base64url");
  return {payload,signature};
}
async function fixture(fn) {
  const home=await mkdtemp(join(tmpdir(),"somewhere-signed-test-"));
  const state=join(home,"state");
  try {
    await mkdir(join(state,"tasks"),{recursive:true,mode:0o700});
    for(const s of ["queued","reserved","completed","failed"]) await mkdir(join(state,"tasks",s),{mode:0o700});
    await writeFile(join(state,"STOP"),"",{mode:0o600});
    return await fn(home,state);
  }finally {await rm(home,{recursive:true,force:true});}
}
test("signed authorization validates exact digest and key",()=>{
  const a=signed();
  assert.equal(verifySignedRequest(input,a,keys).operator,"operator-test");
  assert.throws(()=>verifySignedRequest({...input,prompt:input.prompt+" modified"},a,keys),/match/);
  assert.throws(()=>verifySignedRequest(input,a,{"other":keys["operator-test"]}),/not authorized/);
  assert.throws(()=>verifySignedRequest(input,{...a,signature:"A".repeat(86)},keys),/signature/);
});
test("expired, future and tampered authorization rejected",()=>{
  const now=new Date("2026-11-22T15:00:00.000Z");
  const a=signed(now);
  assert.throws(()=>verifySignedRequest(input,a,keys,new Date(now.getTime()-1)),/not yet valid/);
  assert.throws(()=>verifySignedRequest(input,a,keys,new Date(now.getTime()+180000)),/expired/);
  assert.throws(()=>verifySignedRequest(input,{...a,payload:{...a.payload,operator:"other"}},keys,now),/not authorized/);
  assert.throws(()=>verifySignedRequest(input,{...a,payload:{...a.payload,operation:"deploy"}},keys,now),/Invalid authorization/);
});
test("approval nonce is consumed once and never starts execution",async()=>fixture(async(home,state)=>{
  // In CI root is sometimes used; this path enforces non-root production UID.
  if(uid===0)return;
  const a=signed();
  const first=await submitSignedTask(input,a,{keys,home,uid});
  assert.equal(first.state,"queued");
  assert.equal(first.approved,false);
  assert.equal(first.executed,false);
  assert.equal((await readdir(join(state,"tasks","queued"))).length,1);
  assert.equal((await readdir(join(state,"tasks","reserved"))).length,0);
  await assert.rejects(()=>submitSignedTask(input,a,{keys,home,uid}),/EEXIST/);
  assert.equal((await readdir(join(state,"tasks","queued"))).length,1);
  const record=await readFile(join(state,"remote-authorizations",a.payload.nonce+".consumed"),"utf8");
  assert.equal(record.includes(input.prompt),false);
}));
test("missing STOP prevents queueing even with valid signature",async()=>fixture(async(home,state)=>{
  if(uid===0)return;
  const {unlink}=await import("node:fs/promises");
  await unlink(join(state,"STOP"));
  const a=signed();
  await assert.rejects(()=>submitSignedTask(input,a,{keys,home,uid}),/ENOENT|STOP/);
  assert.equal((await readdir(join(state,"tasks","queued"))).length,0);
}));
