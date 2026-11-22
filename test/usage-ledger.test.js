import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageLedger } from "../control/usage-ledger.js";

const policy={enabled:true,maxCallsPerDay:2,maxCallsPerMonth:3,maxEstimatedUsdPerMonth:3,worstCaseUsdPerCall:1};
const now=new Date("2026-11-22T13:00:00Z");
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),"somewhere-budget-"));try{return await fn(new UsageLedger(dir),dir);}finally{await rm(dir,{recursive:true,force:true});}}

test("durable ledger persists and rejects calls beyond quota",()=>fixture(async ledger=>{
  const first=await ledger.reserve(policy,now);
  assert.ok(first.id);
  await ledger.settle(first.id,now);
  assert.ok((await ledger.reserve(policy,now)).id);
  assert.equal(await ledger.reserve(policy,now),null);
  const reopened=new UsageLedger(ledger.dir);
  assert.equal((await reopened.status(now)).callsToday,2);
  assert.equal((await reopened.status(now)).reservedEstimatedUsd,2);
}));
test("parallel reservations cannot bypass daily limit",()=>fixture(async ledger=>{
  const results=await Promise.all(Array.from({length:8},()=>ledger.reserve(policy,now)));
  assert.equal(results.filter(Boolean).length,2);
  assert.equal((await ledger.status(now)).callsToday,2);
}));
test("ledger refuses corrupt content and stale locks",()=>fixture(async (ledger,dir)=>{
  await writeFile(join(dir,"usage-ledger.json"),"{bad-json",{mode:0o600});
  await assert.rejects(()=>ledger.reserve(policy,now));
  await writeFile(join(dir,"usage-ledger.lock"),"stale",{mode:0o600});
  await assert.rejects(()=>ledger.reserve(policy,now),/stale lock/);
}));
test("ledger resets daily count without refunding monthly reservations",()=>fixture(async ledger=>{
  const first=await ledger.reserve(policy,now);
  const tomorrow=new Date("2026-11-23T13:00:00Z");
  assert.equal((await ledger.status(tomorrow)).callsToday,0);
  await ledger.settle(first.id,tomorrow);
  const second=await ledger.reserve(policy,tomorrow);
  assert.ok(second);
  assert.equal((await ledger.status(tomorrow)).callsThisMonth,2);
}));
test("unsettled reservation blocks month rollover",()=>fixture(async ledger=>{
  await ledger.reserve(policy,now);
  await assert.rejects(()=>ledger.reserve(policy,new Date("2026-12-01T00:00:00Z")),/Unsettled/);
}));
