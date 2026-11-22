// Supervised one-shot preparation and simulated execution.
// Real provider calls are deliberately unavailable in this milestone.
// STOP must remain engaged. The live queue is never reserved/consumed.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApprovalConsumer, validateApprovalBundle } from "./approval-consumer.js";
import { mockDevelopmentResponse } from "./supervisor.js";

export async function oneShotPreview({queue,stopPath,bundle,now=new Date()}) {
  await readFile(stopPath); // fail closed if STOP is absent
  const tasks=await queue.list("queued");
  const task=tasks.find(t=>t.id===bundle?.packet?.taskId);
  if (!task)throw Error("Task no longer queued");
  const verified=validateApprovalBundle(bundle,task,now);
  return {status:"approval-verified",...verified,mode:"offline-only",paidProviderCalls:0};
}

export async function runApprovedOffline({
  queue,stopPath,bundle,consumer,outputDir,now=new Date(),provider=mockDevelopmentResponse
}) {
  // Test-only callback injection is not supported through the operator CLI.
  const preview=await oneShotPreview({queue,stopPath,bundle,now});
  if (!(consumer instanceof ApprovalConsumer))throw Error("Approval consumer required");
  await consumer.consume(bundle,(await queue.list("queued")).find(t=>t.id===preview.taskId),now);
  // Once consumed, never execute paid requests or automatically retry.
  const task=(await queue.list("queued")).find(t=>t.id===preview.taskId);
  const output=await provider(task);
  if (typeof output!=="string" || output.length>10000)throw Error("Invalid proposal output");
  await mkdir(outputDir,{recursive:true,mode:0o700});
  const path=join(outputDir,preview.approvalId+".preview.md");
  await writeFile(path,output,{flag:"wx",mode:0o600});
  return {status:"completed",mode:"offline-only",paidProviderCalls:0,
    taskId:task.id,approvalId:preview.approvalId,outputFile:preview.approvalId+".preview.md"};
}
