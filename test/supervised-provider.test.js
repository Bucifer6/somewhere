import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskQueue } from "../control/task-queue.js";
import { UsageLedger } from "../control/usage-ledger.js";
import { ApprovalConsumer } from "../control/approval-consumer.js";
import { reviewPacket,approvalFor } from "../control/approval-gate.js";
import { executeSupervised,readPrivateKeyFile } from "../control/supervised-provider.js";
import { createTextProposal } from "../control/provider-client.js";

const now=new Date("2026-11-22T14:00:00Z");
const policy={enabled:true,maxCallsPerDay:1,maxCallsPerMonth:1,
  maxEstimatedUsdPerMonth:1,worstCaseUsdPerCall:1};
const key="sk-"+"s".repeat(30);
async function fixture(fn){
  const dir=await mkdtemp(join(tmpdir(),"somewhere-supervised-"));
  const queue=new TaskQueue(join(dir,"queue"));
  const task=await queue.enqueue({type:"development-plan",prompt:"Plan memories and relationships for inhabitants."});
  const packet=reviewPacket(task,now);
  const bundle={packet,approval:approvalFor(packet,task,now)};
  const stopPath=join(dir,"STOP");
  const ledger=new UsageLedger(join(dir,"budget"));
  const consumer=new ApprovalConsumer(join(dir,"consumed"));
  const args={queue,task,bundle,stopPath,ledger,consumer,budgetPolicy:policy,
    outputDir:join(dir,"output"),auditDir:join(dir,"audit"),apiKey:key,now,operatorConfirmed:true};
  try {await fn({dir,args});}finally{await rm(dir,{recursive:true,force:true});}
}
test("paid call requires operator confirmation and emergency STOP",()=>fixture(async({args})=>{
  let called=0;
  const provider=async()=>{called++;return {text:"A valid proposal with sufficient text."};};
  await assert.rejects(()=>executeSupervised({...args,operatorConfirmed:false,provider}),/Operator confirmation/);
  await assert.rejects(()=>executeSupervised({...args,provider}),{code:"ENOENT"});
  assert.equal(called,0);
}));
test("mock provider called once after durable reservation and approval consumption",()=>fixture(async({args,dir})=>{
  await writeFile(args.stopPath,"");
  let called=0;
  const provider=async()=>{
    called++;
    assert.equal((await args.ledger.status(now)).callsToday,1);
    return {text:"A detailed memory and relationship proposal.",inputTokens:120,outputTokens:50,model:"gpt-4.1-mini"};
  };
  const first=await executeSupervised({...args,provider});
  assert.equal(first.status,"completed");
  assert.equal(called,1);
  assert.equal((await args.ledger.status(now)).unsettled,0);
  assert.equal((await args.queue.list("queued")).length,1);
  assert.match(await readFile(join(dir,"output",first.outputFile),"utf8"),/relationship proposal/);
  await assert.rejects(()=>executeSupervised({...args,provider}),{code:"EEXIST"});
  assert.equal(called,1);
}));
test("failure burns task attempt and cannot trigger retry",()=>fixture(async({args})=>{
  await writeFile(args.stopPath,"");
  let called=0;
  await assert.rejects(()=>executeSupervised({...args,provider:async()=>{called++;throw Error("provider timeout");}}),/provider timeout/);
  await assert.rejects(()=>executeSupervised({...args,provider:async()=>{called++;return {text:"not used"};}}),{code:"EEXIST"});
  assert.equal(called,1);
  assert.equal((await args.ledger.status(now)).callsThisMonth,1);
}));
test("different approvals for same task cannot bypass task marker",()=>fixture(async({args})=>{
  await writeFile(args.stopPath,"");
  await executeSupervised({...args,provider:async()=>({text:"A valid result with plenty of useful detail."})});
  const alternate={packet:args.bundle.packet,approval:approvalFor(args.bundle.packet,args.task,now)};
  await assert.rejects(()=>executeSupervised({...args,bundle:alternate,
    provider:async()=>{throw Error("called");}}),{code:"EEXIST"});
}));
test("provider client sends text-only request and reports usage",async()=>{
  let calls=0;
  const result=await createTextProposal({
    task:{type:"development-plan",prompt:"Plan better long term character memories."},
    config:{model:"gpt-4.1-mini",maxOutputTokens:200},apiKey:key,
    fetcher:async(url,options)=>{
      calls++;
      assert.equal(url,"https://api.openai.com/v1/responses");
      const body=JSON.parse(options.body);
      assert.equal(body.store,false);
      assert.equal(body.tools,undefined);
      assert.ok(body.max_output_tokens<=200);
      return {ok:true,json:async()=>({
        status:"completed",
        output:[{content:[{type:"output_text",text:"A fully structured character development proposal."}]}],
        usage:{input_tokens:44,output_tokens:81}
      })};
    }
  });
  assert.equal(calls,1);
  assert.equal(result.outputTokens,81);
  assert.match(result.text,/structured character/);
});
test("provider client rejects absent usage metadata",async()=>{
  await assert.rejects(()=>createTextProposal({
    task:{type:"development-plan",prompt:"Plan a memory schema for Hearth."},
    config:{model:"gpt-4.1-mini",maxOutputTokens:200},apiKey:key,
    fetcher:async()=>({ok:true,json:async()=>({status:"completed",output:[{content:[{type:"output_text",text:"This is a valid mock proposal with text."}]}]})})
  }),/token counts/);
});
test("private credential loader rejects world-readable credentials",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"somewhere-key-"));
  try {
    const file=join(dir,"key");
    await writeFile(file,key+"\n",{mode:0o644});
    await assert.rejects(()=>readPrivateKeyFile(file,process.getuid()),/not private/);
    await chmod(file,0o600);
    assert.equal(await readPrivateKeyFile(file,process.getuid()),key);
  }finally{await rm(dir,{recursive:true,force:true});}
});
