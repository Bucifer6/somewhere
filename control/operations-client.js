// Separately authenticated loopback bridge; no private queue mounts in MCP.
import { lstat, readFile } from "node:fs/promises";
export function validateOperationsClientConfig(env=process.env) {
  const url=env.SOMEWHERE_OPERATIONS_URL;
  const keyFile=env.SOMEWHERE_OPERATIONS_KEY_FILE;
  if (!url && !keyFile) return null;
  if (url !== "http://127.0.0.1:3101/v1/status" ||
      keyFile !== "/run/secrets/somewhere-operations-token") {
    throw Error("Invalid operations bridge configuration");
  }
  return {url,keyFile};
}
export async function fetchOperationsStatus(config, requester=fetch) {
  if (!config || config.url !== "http://127.0.0.1:3101/v1/status" ||
      config.keyFile !== "/run/secrets/somewhere-operations-token") throw Error("Operations bridge unavailable");
  const stat=await lstat(config.keyFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0 || stat.size>512) throw Error("Insecure operations bridge key");
  const token=(await readFile(config.keyFile,"utf8")).trim();
  if (token.length<48 || token.length>256 || /\s/.test(token)) throw Error("Invalid operations bridge key");
  const response=await requester(config.url,{
    method:"GET",headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(5000)
  });
  if (!response.ok) throw Error("Operations bridge HTTP "+response.status);
  const raw=await response.text();
  if (raw.length>16000) throw Error("Operations response too large");
  const result=JSON.parse(raw);
  if (result.schemaVersion!==1 || result.mode!=="read-only" ||
      !["engaged","absent-warning","invalid-fail-closed","unavailable-fail-closed"].includes(result.stop) ||
      result.executionAllowed!==false || result.deploymentVerified!==false ||
      !result.tasks || typeof result.tasks!=="object") throw Error("Invalid operations response");
  const clean={schemaVersion:1,mode:"read-only",stop:result.stop,worldHealth:result.worldHealth==="healthy"?"healthy":"unavailable",
    executionAllowed:false,deploymentVerified:false,tasks:{}};
  for (const state of ["queued","reserved","completed","failed"]) {
    const item=result.tasks[state];
    if (item && Number.isSafeInteger(item.count) && item.count>=0 && Array.isArray(item.tasks) && item.tasks.length<=20) {
      if (item.tasks.some(t => typeof t.id!=="string" || !/^[0-9a-f-]{36}$/i.test(t.id) ||
          !["development-plan","world-story-proposal"].includes(t.type) || t.state!==state ||
          !Number.isSafeInteger(t.attempts) || t.attempts<0 || typeof t.updatedAt!=="string")) throw Error("Invalid task metadata");
      clean.tasks[state]={count:item.count,tasks:item.tasks.map(t=>({id:t.id,type:t.type,state:t.state,attempts:t.attempts,updatedAt:t.updatedAt}))};
    } else {
      clean.tasks[state]={status:"unavailable-fail-closed"};
    }
  }
  return JSON.stringify(clean);
}
