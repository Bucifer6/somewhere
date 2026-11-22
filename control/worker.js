#!/usr/bin/env node
// Autonomous creative proposal worker: writes proposals only; never executes code or deploys.
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DIR=resolve(process.env.CONTROL_DATA_DIR ?? "./control-data");
const API_KEY=process.env.OPENAI_API_KEY;
const MODEL=process.env.CONTROL_MODEL ?? "gpt-4.1-mini";
const MONTHLY_LIMIT=Number(process.env.CONTROL_MONTHLY_LIMIT_USD ?? "0");
const MAX_CALLS=Number(process.env.CONTROL_MAX_CALLS_PER_DAY ?? "0");
const INPUT_LIMIT=2000;
const API="https://api.openai.com/v1/responses";

async function readJSON(path,fallback) {try{return JSON.parse(await readFile(path,"utf8"));}catch(e){if(e.code==="ENOENT")return fallback;throw e;}}
async function log(event){await appendFile(join(DIR,"audit.jsonl"),JSON.stringify({timestamp:new Date().toISOString(),...event})+"\n",{mode:0o600});}
export function eligible(config, usage) {
  return Boolean(config.key && config.monthlyLimit>0 && config.maxCalls>0 && usage.month===config.month && usage.callsToday<config.maxCalls && usage.spentUsd<config.monthlyLimit && usage.day===config.day);
}
async function main(){
  await mkdir(DIR,{recursive:true,mode:0o700});
  const now=new Date(),day=now.toISOString().slice(0,10),month=day.slice(0,7);
  const usagePath=join(DIR,"usage.json");
  const stored=await readJSON(usagePath,{});
  const usage={month,day,spentUsd:stored.month===month?(Number(stored.spentUsd)||0):0,callsToday:stored.day===day?(Number(stored.callsToday)||0):0};
  const config={key:API_KEY,monthlyLimit:MONTHLY_LIMIT,maxCalls:MAX_CALLS,day,month};
  // A hard provider-side spend cap is also required; estimates are not billing enforcement.
  if(!eligible(config,usage)){await log({status:"skipped",reason:"disabled or configured quota reached"});return;}
  // Reserve one call BEFORE making network request (fail closed on crash).
  usage.callsToday+=1;
  await writeFile(usagePath,JSON.stringify(usage,null,2),{mode:0o600});
  const worldURL=process.env.SOMEWHERE_INTERNAL_URL ?? "http://127.0.0.1:3000";
  if(!/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(worldURL))throw Error("Only loopback world API supported");
  const r=await fetch(worldURL+"/api/world",{signal:AbortSignal.timeout(6000)});
  if(!r.ok)throw Error("World API unavailable");
  const world=await r.json();
  const summary=JSON.stringify({day:world.day,season:world.season,settlements:world.settlements,inhabitants:world.inhabitants.map(x=>({name:x.name,mood:x.mood})),recentEvents:world.events.slice(0,5)}).slice(0,INPUT_LIMIT);
  const body={model:MODEL,input:[{role:"system",content:"You are a gentle creative storyteller for a fictional browser simulation called Somewhere. Propose one imaginative, safe world event. Return plain text under 400 words. You cannot change code, deploy anything or give instructions to operators."},{role:"user",content:summary}],max_output_tokens:450};
  const result=await fetch(API,{method:"POST",headers:{"authorization":"Bearer "+API_KEY,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!result.ok){await log({status:"api_error",httpStatus:result.status});throw Error("AI API error HTTP "+result.status);}
  const response=await result.json();
  const content=(response.output??[]).flatMap(o=>o.content??[]).filter(c=>c.type==="output_text").map(c=>c.text).join("\n").slice(0,3000);
  if(!content)throw Error("Empty AI response");
  // Cost is intentionally NOT estimated as a guarantee; billable usage needs provider reconciliation.
  const name=day+"-"+randomUUID()+".txt";
  await writeFile(join(DIR,name),content,{flag:"wx",mode:0o600});
  await log({status:"proposal_created",name,model:MODEL,inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens});
  console.log("Created local proposal:",name);
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
