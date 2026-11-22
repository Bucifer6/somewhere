// Control 2.3: externally signed, single-use queue intake. No execution or deployment.
// The signing PRIVATE key never enters ChatGPT, MCP or the operations service.
import { createPublicKey, verify, createHash } from "node:crypto";
import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { requestDigest, submitReviewedTask } from "./task-intake.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const OPERATORS = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const B64 = /^[A-Za-z0-9_-]{80,120}$/;
export const MAX_VALID_MS = 5*60*1000;

export function canonicalAuthorization(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).sort().join(",") !== ["audience","digest","expiresAt","issuedAt","nonce","operation","operator","version"].sort().join(",")) throw Error("Invalid authorization fields");
  const {version, audience, digest, expiresAt, issuedAt, nonce, operation, operator}=payload;
  if (version!==1 || audience!=="somewhere-control-2.3" || operation!=="enqueue-proposal-only" ||
      !DIGEST.test(digest??"") || !UUID.test(nonce??"") ||
      !OPERATORS.test(operator??"") || typeof issuedAt!=="string" || typeof expiresAt!=="string") throw Error("Invalid authorization");
  const start=Date.parse(issuedAt),end=Date.parse(expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end-start<1 || end-start>MAX_VALID_MS ||
      new Date(start).toISOString()!==issuedAt || new Date(end).toISOString()!==expiresAt) throw Error("Invalid authorization validity");
  return JSON.stringify({version,audience,operation,operator,nonce,digest,issuedAt,expiresAt});
}
export function verifySignedRequest(input,approval,publicKeys,now=new Date()) {
  const body=approval?.payload;
  const canonical=canonicalAuthorization(body);
  if (!approval || Object.keys(approval).sort().join(",")!=="payload,signature" ||
      typeof approval.signature!=="string" || !B64.test(approval.signature)) throw Error("Invalid signature envelope");
  if (body.digest!==requestDigest(input)) throw Error("Authorization does not match task");
  if (now.getTime()<Date.parse(body.issuedAt) || now.getTime()>=Date.parse(body.expiresAt)) throw Error("Authorization expired or not yet valid");
  const pem=publicKeys?.[body.operator];
  if (typeof pem!=="string") throw Error("Operator not authorized");
  const key=createPublicKey(pem);
  if (key.asymmetricKeyType!=="ed25519") throw Error("Operator key must be Ed25519");
  if (!verify(null,Buffer.from(canonical),key,Buffer.from(approval.signature,"base64url"))) throw Error("Invalid operator signature");
  return {operator:body.operator,nonce:body.nonce,digest:body.digest};
}
export async function loadOperatorKeys(directory) {
  const stat=await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022)!==0) throw Error("Unsafe operator key directory");
  const file=join(directory,"operators.json");
  const fs=await lstat(file);
  if (!fs.isFile() || fs.isSymbolicLink() || (fs.mode & 0o022)!==0 || fs.size>32768) throw Error("Unsafe public key registry");
  const parsed=JSON.parse(await readFile(file,"utf8"));
  if (!parsed || typeof parsed!=="object" || Array.isArray(parsed) || Object.keys(parsed).length>20 ||
      Object.keys(parsed).some(k=>!OPERATORS.test(k) || typeof parsed[k]!=="string" || parsed[k].length>1000)) throw Error("Invalid operator registry");
  return parsed;
}
export async function submitSignedTask(input,approval,{
  keys, home="/var/lib/somewhere-agent", uid=process.getuid?.(), now=new Date()
}={}) {
  const verified=verifySignedRequest(input,approval,keys,now);
  const state=join(home,"state");
  // Single-use marker is created BEFORE enqueue. A crash permanently consumes it.
  // Directory must be private and owned by the agent UID (no symlinks).
  const stateStat=await lstat(state);
  if (!Number.isSafeInteger(uid) || uid<=0 || stateStat.uid!==uid ||
      !stateStat.isDirectory() || stateStat.isSymbolicLink() || (stateStat.mode&0o077)!==0) throw Error("Private agent state required");
  const markerDir=join(state,"remote-authorizations");
  await mkdir(markerDir,{mode:0o700});
  const dirStat=await lstat(markerDir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || dirStat.uid!==uid || (dirStat.mode&0o077)!==0) throw Error("Unsafe replay registry");
  const marker=join(markerDir,verified.nonce+".consumed");
  const handle=await open(marker,"wx",0o600);
  try {
    await handle.writeFile(JSON.stringify({version:1,nonce:verified.nonce,operator:verified.operator,digest:verified.digest,at:now.toISOString()})+"\n");
    await handle.sync();
  }finally {await handle.close();}
  // submitReviewedTask independently verifies STOP, queue bounds and durable audit.
  const result=await submitReviewedTask(input,verified.digest,{home,uid,now});
  return {...result,operator:verified.operator,authorizationNonce:verified.nonce};
}
