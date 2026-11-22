// Explicitly operator-gated single paid call; NO CLI is enabled by default.
// The live queue stays queued. STOP must remain engaged. Never retry a request.
// Provider charges can exceed local estimates; this is not a billing guarantee.
import { readFile, lstat, mkdir, open, writeFile, appendFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { validateApprovalBundle } from "./approval-consumer.js";
import { createTextProposal } from "./provider-client.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readPrivateKeyFile(path,ownerUid=0) {
  const info=await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid!==ownerUid ||
      (info.mode & 0o077)!==0 || info.size>512)
    throw Error("Provider key file is not private");
  const content=(await readFile(path,"utf8")).trim();
  if (!content.startsWith("sk-") || content.length<20 || /\s/.test(content))
    throw Error("Provider key format invalid");
  return content;
}

export async function executeSupervised({
  queue,stopPath,bundle,ledger,budgetPolicy,consumer,outputDir,
  auditDir,apiKey,provider=createTextProposal,now=new Date(),
  operatorConfirmed=false
}) {
  if (operatorConfirmed!==true)throw Error("Operator confirmation required");
  await readFile(stopPath); // STOP must be engaged; fail closed otherwise
  const tasks=await queue.list("queued");
  const task=tasks.find(item=>item.id===bundle?.packet?.taskId);
  if (!task)throw Error("Approved task is no longer queued");
  const {taskId,approvalId}=validateApprovalBundle(bundle,task,now);
  if (!UUID.test(taskId)||!UUID.test(approvalId) ||
      !ledger || !consumer || !budgetPolicy ||
      !outputDir || !auditDir)throw Error("Invalid supervised execution configuration");
  if (typeof apiKey!=="string" || apiKey.length<20)throw Error("Missing provider key");

  // Prevent two different approvals from issuing two calls for the same task.
  // Permanent task marker persists through provider errors and crashes.
  const attemptedDir=join(resolve(auditDir),"attempted");
  await mkdir(attemptedDir,{recursive:true,mode:0o700});
  const attempt=await open(join(attemptedDir,taskId+".attempted"),"wx",0o600);
  try {
    await attempt.writeFile(JSON.stringify({taskId,approvalId,at:now.toISOString()})+"\n");
    await attempt.sync();
  } finally {await attempt.close();}
  const audit=async(event,details={})=>{
    await appendFile(join(resolve(auditDir),"events.jsonl"),
      JSON.stringify({at:new Date().toISOString(),taskId,approvalId,event,...details})+"\n",
      {mode:0o600});
  };
  let reservation=null;
  try {
    await audit("attempt-created");
    // The token budget is deliberately conservative; hard provider-side limits
    // and account monitoring remain mandatory outside this application.
    reservation=await ledger.reserve(budgetPolicy);
    if (!reservation)throw Error("Budget quota denied");
    await audit("budget-reserved",{reservationId:reservation.id});
    await consumer.consume(bundle,task,now);
    await audit("approval-consumed");
    await readFile(stopPath);
    const result=await provider({
      task,
      config:{model:"gpt-4.1-mini",maxOutputTokens:800},
      apiKey
    });
    if (!result || typeof result.text!=="string" ||
        result.text.length<20 || result.text.length>10000)
      throw Error("Invalid provider result");
    await readFile(stopPath);
    await mkdir(outputDir,{recursive:true,mode:0o700});
    const filename=taskId+"-"+approvalId+".md";
    await writeFile(join(outputDir,filename),result.text,{flag:"wx",mode:0o600});
    await audit("provider-completed",{
      inputTokens:result.inputTokens??null,outputTokens:result.outputTokens??null,
      model:result.model??"unknown",outputFile:filename
    });
    return {status:"completed",taskId,approvalId,outputFile:filename,
      inputTokens:result.inputTokens??null,outputTokens:result.outputTokens??null};
  }catch(error){
    try {await audit("operation-failed",{errorClass:error.name});}catch{}
    throw error;
  }finally{
    if (reservation) {
      // Retain the worst-case budget charge even when a provider fails.
      await ledger.settle(reservation.id);
    }
  }
}
