// Control 0.9: immutable operator review and approval records.
// Approval does not run AI or remove STOP. A future executor must independently
// verify all conditions, including task identity, expiry and budget.
import { createHash, randomUUID } from "node:crypto";
import { open, readFile, lstat, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const MAX_AGE_MS=15*60*1000;
const TASK_TYPES=new Set(["development-plan","world-story-proposal"]);

export function taskFingerprint(task) {
  if (!task || !UUID.test(task.id??"") || !TASK_TYPES.has(task.type) ||
      task.state!=="queued" || typeof task.prompt!=="string" ||
      task.prompt.length<10 || task.prompt.length>1500) throw Error("Invalid queued task");
  return createHash("sha256").update(JSON.stringify({
    taskId:task.id,type:task.type,prompt:task.prompt,state:"queued"
  })).digest("hex");
}

export function reviewPacket(task,now=new Date()) {
  const digest=taskFingerprint(task);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))throw Error("Invalid clock");
  return Object.freeze({
    version:1,
    repository:"Bucifer6/somewhere",
    taskId:task.id,
    type:task.type,
    taskSha256:digest,
    createdAt:now.toISOString(),
    expiresAt:new Date(now.getTime()+MAX_AGE_MS).toISOString(),
    operation:"single-supervised-proposal",
    maxProviderCalls:1,
    output:"private-draft-only",
    automaticGitHubWrites:false,
    productionAccess:false
  });
}

export function validateApproval(packet,approval,task,now=new Date()) {
  if (!packet || packet.version!==1 || packet.repository!=="Bucifer6/somewhere" ||
      packet.operation!=="single-supervised-proposal" || packet.maxProviderCalls!==1 ||
      packet.automaticGitHubWrites!==false || packet.productionAccess!==false ||
      packet.output!=="private-draft-only" || !SHA.test(packet.taskSha256??"")) throw Error("Invalid review packet");
  if (!approval || approval.version!==1 || approval.action!=="approve-one-call" ||
      approval.taskId!==packet.taskId || approval.taskSha256!==packet.taskSha256 ||
      approval.expiresAt!==packet.expiresAt || !UUID.test(approval.approvalId??"")) throw Error("Approval mismatch");
  if (taskFingerprint(task)!==packet.taskSha256 || task.id!==packet.taskId) throw Error("Task changed since review");
  const created=new Date(packet.createdAt).getTime(),expires=new Date(packet.expiresAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires-created!==MAX_AGE_MS ||
      now.getTime()<created || now.getTime()>=expires) throw Error("Approval expired or clock invalid");
  return true;
}

export function approvalFor(packet,task,now=new Date()) {
  // This function does NOT obtain operator consent; the CLI must enforce it.
  const a={version:1,action:"approve-one-call",approvalId:randomUUID(),
    taskId:packet.taskId,taskSha256:packet.taskSha256,expiresAt:packet.expiresAt};
  validateApproval(packet,a,task,now);
  return a;
}

export async function assertStopFile(stopPath) {
  const info=await lstat(stopPath);
  if (!info.isFile())throw Error("STOP must be a regular file");
  return true;
}

export async function requirePrivateRootFile(path) {
  const info=await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid!==0 || (info.mode & 0o077)!==0)
    throw Error("Approval file must be root-owned regular file with mode 0600");
  return JSON.parse(await readFile(path,"utf8"));
}

export async function writePrivateApproval(approval,outputDir) {
  const dir=resolve(outputDir);
  if (dir!=="/root/somewhere-approvals")throw Error("Unapproved output directory");
  await mkdir(dir,{recursive:true,mode:0o700});
  const destination=join(dir,approval.approvalId+".json");
  const handle=await open(destination,"wx",0o600);
  try { await handle.writeFile(JSON.stringify(approval,null,2)+"\n"); }
  finally { await handle.close(); }
  return destination;
}
