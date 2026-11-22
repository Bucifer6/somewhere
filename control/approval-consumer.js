// Control 1.0: fail-closed consumption of operator approvals.
// This module does not call providers, GitHub or shell commands.
// A consumed approval is NEVER released or retried, including after crashes.
import { mkdir, open, readFile, lstat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { validateApproval } from "./approval-gate.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateApprovalBundle(bundle,task,now=new Date()) {
  if (!bundle || typeof bundle!=="object" || Array.isArray(bundle) ||
      !bundle.packet || !bundle.approval ||
      Object.keys(bundle).some(k=>!["packet","approval"].includes(k)))
    throw Error("Invalid approval bundle");
  validateApproval(bundle.packet,bundle.approval,task,now);
  return {taskId:task.id,approvalId:bundle.approval.approvalId};
}

export class ApprovalConsumer {
  constructor(directory) {this.directory=resolve(directory);}
  async consume(bundle,task,now=new Date()) {
    const {taskId,approvalId}=validateApprovalBundle(bundle,task,now);
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const path=join(this.directory,approvalId+".consumed");
    // O_EXCL is the one-use gate; never unlink this file. If a process
    // crashes after creation, operator review is required, not a replay.
    const handle=await open(path,"wx",0o600);
    try {
      await handle.writeFile(JSON.stringify({version:1,approvalId,taskId,consumedAt:now.toISOString()})+"\n");
      await handle.sync();
    }finally{await handle.close();}
    return {approvalId,taskId,status:"consumed"};
  }
}

export async function readApprovalBundle(path,allowedDirectory="/root/somewhere-approvals") {
  const dir=resolve(allowedDirectory);
  const absolute=resolve(path);
  if (absolute!==join(dir,basename(absolute)) ||
      !UUID.test(basename(absolute).replace(/\.json$/,"")) ||
      !absolute.endsWith(".json")) throw Error("Unapproved approval file path");
  const stat=await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode&0o077)!==0 ||
      (dir==="/root/somewhere-approvals" && stat.uid!==0))
    throw Error("Approval file must be private regular file");
  return JSON.parse(await readFile(absolute,"utf8"));
}
