// An opt-in, narrowly scoped creative-action bridge. The MCP never gets shell,
// filesystem access to the world volume, Docker credentials or deployment rights.
import { lstat, readFile } from "node:fs/promises";
import { validateWorldAction } from "../src/world-action.js";

const PATH="/run/secrets/somewhere-creative-token";
const ENDPOINT="http://127.0.0.1:3000/internal/creative-action";
export function validateWorldActionBridge(env=process.env) {
  const value=env.SOMEWHERE_WORLD_ACTION_KEY_FILE;
  if (!value) return null;
  if (value!==PATH) throw Error("Unsupported creative-action secret path");
  return {keyFile:PATH,url:ENDPOINT};
}
export async function executeWorldAction(config,input,requester=fetch) {
  if (!config || config.keyFile!==PATH || config.url!==ENDPOINT) throw Error("Creative-action bridge disabled");
  const action=validateWorldAction(input);
  const stat=await lstat(config.keyFile);
  if(!stat.isFile() || stat.isSymbolicLink() ||
     stat.uid!==process.getuid?.() || (stat.mode&0o077)!==0 || stat.size>512) throw Error("Unsafe creative-action secret");
  const key=(await readFile(config.keyFile,"utf8")).trim();
  if(key.length<48 || key.length>256 || /\s/.test(key)) throw Error("Invalid creative-action secret");
  const response=await requester(config.url,{
    method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+key},
    body:JSON.stringify(action),redirect:"error",signal:AbortSignal.timeout(5000)
  });
  const body=await response.text();
  if(body.length>4096) throw Error("Creative-action response too large");
  if(!response.ok) throw Error("Creative-action rejected (HTTP "+response.status+")");
  const result=JSON.parse(body);
  if(!result || result.requestId!==action.requestId || result.action!==action.action ||
     !["applied","already-applied"].includes(result.status)) throw Error("Invalid creative-action response");
  return JSON.stringify(result);
}
