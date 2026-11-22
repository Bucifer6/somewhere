#!/usr/bin/env node
// Minimal MCP stdio server. No inbound listener, no shell access, no mutation tools.
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
const BASE_URL = process.env.SOMEWHERE_INTERNAL_URL ?? "http://127.0.0.1:3000";
const ALLOWED_BASE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/;
if (!ALLOWED_BASE.test(BASE_URL)) {
  console.error("SOMEWHERE_INTERNAL_URL must be a loopback HTTP address");
  process.exit(1);
}
const tools = [
  {name:"somewhere_health",description:"Read the Somewhere simulation health (read-only)",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"somewhere_world",description:"Read a snapshot of the Somewhere world state (read-only)",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"somewhere_roadmap",description:"Read project roadmap from the deployed repository (read-only)",inputSchema:{type:"object",properties:{},additionalProperties:false}}
];
async function invoke(name) {
  if (name === "somewhere_roadmap") return (await readFile(new URL("../docs/ROADMAP.md",import.meta.url),"utf8")).slice(0,20000);
  if (name !== "somewhere_health" && name !== "somewhere_world") throw Error("Unknown tool");
  const endpoint = name === "somewhere_health" ? "/api/health" : "/api/world";
  const res=await fetch(BASE_URL + endpoint,{signal:AbortSignal.timeout(5000)});
  if (!res.ok) throw Error("World API HTTP " + res.status);
  return (await res.text()).slice(0,100000);
}
function write(message){process.stdout.write(JSON.stringify(message)+"\n");}
export async function dispatch(msg) {
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return {jsonrpc:"2.0",id:msg.id??null,error:{code:-32600,message:"Invalid request"}};
  if (msg.method==="notifications/initialized") return null;
  if (msg.method==="initialize") return {jsonrpc:"2.0",id:msg.id,result:{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"somewhere-control",version:"0.1.0"}}};
  if (msg.method==="ping") return {jsonrpc:"2.0",id:msg.id,result:{}};
  if (msg.method==="tools/list") return {jsonrpc:"2.0",id:msg.id,result:{tools}};
  if (msg.method==="tools/call") {
    try {
      if (msg.params?.arguments && (typeof msg.params.arguments!=="object" || Object.keys(msg.params.arguments).length)) throw Error("Unexpected arguments");
      const result=await invoke(msg.params?.name);
      return {jsonrpc:"2.0",id:msg.id,result:{content:[{type:"text",text:result}]}};
    } catch(error) {
      return {jsonrpc:"2.0",id:msg.id,result:{content:[{type:"text",text:String(error.message)}],isError:true}};
    }
  }
  return {jsonrpc:"2.0",id:msg.id??null,error:{code:-32601,message:"Method not found"}};
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
  lines.on("line", async line=>{try{const msg=JSON.parse(line);const out=await dispatch(msg);if(out && msg.id!==undefined)write(out);}catch(e){write({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}});}});
}
