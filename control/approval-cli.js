#!/usr/bin/env node
// Explicit operator-review CLI. Only writes approval metadata: never calls AI,
// removes STOP, reads credentials, changes queue or invokes GitHub.
import { join } from "node:path";
import { TaskQueue } from "./task-queue.js";
import { assertStopFile, reviewPacket, approvalFor, writePrivateApproval } from "./approval-gate.js";

const HOME="/var/lib/somewhere-agent";
const STOP=join(HOME,"state","STOP");
const queue=new TaskQueue(join(HOME,"state","tasks"));
const action=process.argv[2]??"review";

async function main() {
  if (process.getuid?.()!==0)throw Error("Operator-only: run as root");
  await assertStopFile(STOP);
  const queued=await queue.list("queued");
  if (!queued.length)throw Error("No queued tasks");
  const task=queued[0];
  const packet=reviewPacket(task);
  if (action==="review") {
    console.log(JSON.stringify({status:"REVIEW_ONLY_NO_API_CALL",...packet},null,2));
    return;
  }
  if (action!=="approve")throw Error("Usage: approval-cli.js review | approve <taskSha256>");
  // Require operator to type the full 64-character hash displayed by review.
  if (!process.argv[3] || process.argv[3]!==packet.taskSha256)
    throw Error("Explicit task fingerprint confirmation required: review again");
  const approval=approvalFor(packet,task);
  const path=await writePrivateApproval({packet,approval,approvalId:approval.approvalId},"/root/somewhere-approvals");
  console.log(JSON.stringify({status:"APPROVED_METADATA_ONLY_NO_API_CALL",
    taskId:task.id,approvalFile:path,expiresAt:packet.expiresAt},null,2));
}
main().catch(error=>{console.error("Approval operation aborted: "+error.message);process.exitCode=1;});
