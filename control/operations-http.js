// Private, read-only operations API. Never exposes task prompts, approval bundles or execution.
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { operationsSnapshot } from "./operations-snapshot.js";

function matches(a, b) {
  const left=createHash("sha256").update(String(a ?? "")).digest();
  const right=createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(left,right);
}
export function validateOperationsBind(host,port) {
  if (host !== "127.0.0.1" && host !== "::1") throw Error("Operations listener must bind to loopback");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Invalid operations port");
  return {host,port};
}
export async function readPrivateOperationsToken(path, uid=process.getuid?.()) {
  const stat=await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077)!==0 || stat.size > 512) throw Error("Operations secret must be an owner-only regular file");
  const token=(await readFile(path,"utf8")).trim();
  if (token.length < 48 || token.length > 256 || /\s/.test(token)) throw Error("Invalid operations secret");
  return token;
}
export function createOperationsServer({token,snapshot=operationsSnapshot,audit=()=>{}}) {
  if (typeof token !== "string" || token.length < 48) throw Error("Strong operations secret required");
  const recent=new Map();
  return http.createServer(async (req,res)=>{
    const start=Date.now();
    const send=(code,result,action)=>{
      res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
      res.end(JSON.stringify(result));
      try { audit({timestamp:new Date().toISOString(),status:code,action,durationMs:Date.now()-start}); } catch {}
    };
    // Fail closed on any Origin, malformed path, query, body or unsupported method.
    if (req.headers.origin) return send(403,{error:"Forbidden"},"origin-denied");
    if (req.url !== "/v1/status") return send(404,{error:"Not found"},"not-found");
    if (req.method !== "GET") return send(405,{error:"Method not allowed"},"method-denied");
    if (!matches(req.headers.authorization,"Bearer "+token)) return send(401,{error:"Unauthorized"},"auth-denied");
    const caller=req.socket.remoteAddress ?? "unknown";
    const now=Date.now();
    const entry=recent.get(caller);
    if (entry && now-entry.since<60000) {
      if (++entry.calls>30) return send(429,{error:"Rate limit"},"rate-limited");
    } else {
      recent.clear(); recent.set(caller,{since:now,calls:1});
    }
    try {
      const result=await snapshot();
      // Only an allowlisted shape is returned to the remote read-only MCP bridge.
      const states={};
      for (const state of ["queued","reserved","completed","failed"]) {
        const item=result.tasks?.[state];
        states[state]=item && Number.isSafeInteger(item.count) && item.count>=0
          ? {count:item.count,tasks:(item.tasks??[]).slice(0,20).map(t=>({
            id:t.id,type:t.type,state:t.state,attempts:t.attempts,updatedAt:t.updatedAt
          }))}
          : {status:"unavailable-fail-closed"};
      }
      const output={schemaVersion:1,mode:"read-only",stop:["engaged","absent-warning","invalid-fail-closed","unavailable-fail-closed"].includes(result.stop)?result.stop:"unavailable-fail-closed",
        tasks:states,worldHealth:result.liveWorldHealth?.status==="healthy"?"healthy":"unavailable",
        deploymentVerified:false,executionAllowed:false};
      send(200,output,"status-read");
    } catch {
      send(503,{error:"Unavailable"},"snapshot-failed");
    }
  });
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  try {
    const {host,port}=validateOperationsBind(process.env.SOMEWHERE_OPERATIONS_HOST??"127.0.0.1",Number(process.env.SOMEWHERE_OPERATIONS_PORT??"3101"));
    if (process.getuid?.()===0) throw Error("Do not run operations server as root");
    const token=await readPrivateOperationsToken(process.env.SOMEWHERE_OPERATIONS_KEY_FILE??"/run/secrets/somewhere-operations-token");
    const server=createOperationsServer({token,audit:e=>console.error(JSON.stringify({type:"operations_audit",...e}))});
    server.listen(port,host,()=>console.error("Operations read-only listener active on loopback"));
  } catch(error) {
    console.error("Operations server refused to start: "+error.message);
    process.exitCode=1;
  }
}
