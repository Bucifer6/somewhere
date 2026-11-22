#!/usr/bin/env node
// Operator-only one-shot offline execution. NO NETWORK OR REAL PROVIDER CALLS.
// This command intentionally does not accept API credentials or provider options.
import { join } from "node:path";
import { TaskQueue } from "./task-queue.js";
import { ApprovalConsumer, readApprovalBundle } from "./approval-consumer.js";
import { oneShotPreview, runApprovedOffline } from "./one-shot.js";

const HOME="/var/lib/somewhere-agent";
const APPROVAL_DIR="/root/somewhere-approvals";
const CONSUMED_DIR="/root/somewhere-approvals/consumed";
const OUTPUT_DIR="/root/somewhere-approvals/previews";
const STOP=join(HOME,"state","STOP");
const queue=new TaskQueue(join(HOME,"state","tasks"));

async function main() {
  if (process.getuid?.()!==0)throw Error("Operator-only: requires root");
  const mode=process.argv[2];
  const file=process.argv[3];
  if (!["preview","run-offline"].includes(mode) || !file || process.argv.length!==4) {
    throw Error("Usage: one-shot-cli.js preview|run-offline /root/somewhere-approvals/APPROVAL-ID.json");
  }
  const bundle=await readApprovalBundle(file,APPROVAL_DIR);
  if (mode==="preview") {
    console.log(JSON.stringify(await oneShotPreview({queue,stopPath:STOP,bundle}),null,2));
    return;
  }
  const consumer=new ApprovalConsumer(CONSUMED_DIR);
  console.log(JSON.stringify(await runApprovedOffline({
    queue,stopPath:STOP,bundle,consumer,outputDir:OUTPUT_DIR
  }),null,2));
}
main().catch(error=>{
  // Never print approval content, credentials or proposals in error output.
  console.error("Operator operation aborted: "+(error?.code==="EEXIST"?"approval already consumed":"validation or execution failed"));
  process.exitCode=1;
});
