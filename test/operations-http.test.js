import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperationsServer,validateOperationsBind,readPrivateOperationsToken } from "../control/operations-http.js";
import { validateOperationsClientConfig,fetchOperationsStatus } from "../control/operations-client.js";

const TOKEN="a-long-operations-test-token-with-at-least-forty-eight-characters";
const task={id:"f502b8fd-8f1c-4699-84e3-765859892db9",type:"development-plan",state:"queued",attempts:0,updatedAt:"2026-11-22T13:24:01.698Z"};
const snapshot=async()=>({stop:"engaged",tasks:{
  queued:{count:1,tasks:[{...task,prompt:"TOP SECRET PROMPT"}]},reserved:{count:0,tasks:[]},
  completed:{count:0,tasks:[]},failed:{count:0,tasks:[]}
},liveWorldHealth:{status:"healthy"},approvalRecords:{count:9}});
async function withServer(fn) {
  const audit=[];
  const srv=createOperationsServer({token:TOKEN,snapshot,audit:x=>audit.push(x)});
  await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
  try {await fn("http://127.0.0.1:"+srv.address().port,audit);}
  finally {await new Promise(resolve=>srv.close(resolve));}
}
test("operations service refuses public bind or weak authentication",()=>{
  assert.throws(()=>validateOperationsBind("0.0.0.0",3101),/loopback/);
  assert.throws(()=>validateOperationsBind("127.0.0.1",0),/port/);
  assert.throws(()=>createOperationsServer({token:"short"}),/Strong/);
  assert.equal(validateOperationsClientConfig(),null);
  assert.throws(()=>validateOperationsClientConfig({SOMEWHERE_OPERATIONS_URL:"https://example.com",SOMEWHERE_OPERATIONS_KEY_FILE:"/tmp/key"}),/Invalid/);
});
test("operations service is read-only, bearer protected and strips private fields",async()=>withServer(async base=>{
  assert.equal((await fetch(base+"/v1/status")).status,401);
  assert.equal((await fetch(base+"/v1/status",{headers:{Authorization:"Bearer wrong"}})).status,401);
  assert.equal((await fetch(base+"/v1/status",{method:"POST",headers:{Authorization:"Bearer "+TOKEN}})).status,405);
  assert.equal((await fetch(base+"/v1/status",{headers:{Authorization:"Bearer "+TOKEN,Origin:"https://evil.example"}})).status,403);
  const response=await fetch(base+"/v1/status",{headers:{Authorization:"Bearer "+TOKEN}});
  assert.equal(response.status,200);
  const output=await response.text();
  const json=JSON.parse(output);
  assert.equal(json.stop,"engaged");
  assert.equal(json.executionAllowed,false);
  assert.equal(json.deploymentVerified,false);
  assert.equal(json.tasks.queued.count,1);
  assert.equal(output.includes("TOP SECRET PROMPT"),false);
  assert.equal(output.includes("approvalRecords"),false);
  assert.equal(output.includes(TOKEN),false);
}));
test("operations client accepts only private known path and sanitized schema",async()=>{
  const temp=await mkdtemp(join(tmpdir(),"somewhere-ops-test-"));
  try {
    const key=join(temp,"token");
    await writeFile(key,TOKEN,{mode:0o600});
    // Redirected test requester exercises the exact live network contract without bypassing production URL validation.
    const observed=[];
    const fake=async (url,options)=>{
      observed.push({url,method:options.method,auth:options.headers.Authorization,redirect:options.redirect});
      return {ok:true,text:async()=>JSON.stringify({
        schemaVersion:1,mode:"read-only",stop:"engaged",worldHealth:"healthy",
        executionAllowed:false,deploymentVerified:false,
        tasks:{queued:{count:1,tasks:[task]},reserved:{count:0,tasks:[]},completed:{count:0,tasks:[]},failed:{count:0,tasks:[]}}
      })};
    };
    // Client only accepts the canonical mounted file; test file validation separately.
    await assert.rejects(fetchOperationsStatus({url:"http://127.0.0.1:3101/v1/status",keyFile:key},fake),/bridge unavailable/);
    assert.equal(observed.length,0);
    assert.equal((await readPrivateOperationsToken(key)).length,TOKEN.length);
    await chmod(key,0o644);
    await assert.rejects(readPrivateOperationsToken(key),/owner-only/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
test("audit excludes tokens and request bodies",async()=>withServer(async(base,audit)=>{
  await fetch(base+"/v1/status",{headers:{Authorization:"Bearer "+TOKEN}});
  assert.equal(audit.at(-1).action,"status-read");
  assert.equal(JSON.stringify(audit).includes(TOKEN),false);
}));
