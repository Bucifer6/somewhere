#!/usr/bin/env node
// Root-operator one-shot provider interface. DISABLED BY DEFAULT.
// Never runs background jobs, AI-authored code, deployment or GitHub writes.
import { join } from "node:path";
import { TaskQueue } from "./task-queue.js";
import { UsageLedger } from "./usage-ledger.js";
import { ApprovalConsumer,readApprovalBundle } from "./approval-consumer.js";
import { oneShotPreview } from "./one-shot.js";
import { executeSupervised,readPrivateKeyFile } from "./supervised-provider.js";

const HOME="/var/lib/somewhere-agent";
const DIR="/root/somewhere-approvals";
const STOP=join(HOME,"state","STOP");
const POLICY=Object.freeze({
  enabled:true,maxCallsPerDay:1,maxCallsPerMonth:1,
  maxEstimatedUsdPerMonth:1,worstCaseUsdPerCall:1
});
const queue=new TaskQueue(join(HOME,"state","tasks"));

async function main(){
  if(process.getuid?.()!==0)throw Error("Operator-only root context required");
  const mode=process.argv[2],file=process.argv[3],fingerprint=process.argv[4];
  if(!["preview","execute"].includes(mode) || !file ||
    (mode==="preview" && process.argv.length!==4) ||
    (mode==="execute" && process.argv.length!==5))
    throw Error("Usage: paid-one-shot-cli.js preview APPROVAL_FILE | execute APPROVAL_FILE EXACT_TASK_SHA256");

  const bundle=await readApprovalBundle(file,DIR);
  const preview=await oneShotPreview({queue,stopPath:STOP,bundle});
  if(mode==="preview"){
    console.log(JSON.stringify({...preview,paidProviderCalls:0,executionEnabled:false},null,2));
    return;
  }
  if(process.env.SOMEWHERE_PAID_ONE_SHOT_ENABLED!=="EXPLICIT_OPERATOR_ENABLE" ||
     process.env.SOMEWHERE_PROVIDER_LIMIT_VERIFIED!=="YES" ||
     fingerprint!==bundle.packet.taskSha256)
    throw Error("Paid execution disabled or task fingerprint not confirmed");
  // Credential never accepted as CLI arg or environment variable.
  const key=await readPrivateKeyFile("/root/somewhere-secrets/openai-api-key");
  const result=await executeSupervised({
    queue,stopPath:STOP,bundle,
    ledger:new UsageLedger(join(HOME,"state","paid-usage")),
    budgetPolicy:POLICY,
    consumer:new ApprovalConsumer(join(DIR,"consumed")),
    outputDir:join(DIR,"paid-proposals"),
    auditDir:join(DIR,"paid-audit"),
    apiKey:key,
    operatorConfirmed:true
  });
  console.log(JSON.stringify({...result,warning:"Local estimated usage is not provider billing. Verify actual charges in provider console."},null,2));
}

main().catch(error=>{
  // Never echo provider headers, keys or detailed API response bodies.
  console.error("One-shot operation refused or failed: "+(error?.code==="EEXIST"?"task already attempted":"verify approval, STOP, provider limits and private credentials"));
  process.exitCode=1;
});
