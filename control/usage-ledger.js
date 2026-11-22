// Persistent, fail-closed budget reservations for future agent calls.
// No provider calls are made from this module.
// Use on a single local filesystem. Refuse stale locks rather than guessing
// whether another worker is active. Provider billing must still be enforced.
import { mkdir, open, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validateBudgetPolicy } from "./budget.js";

const LOCK_RETRIES = 8;
const LOCK_WAIT_MS = 60;

function dateKeys(now) {
  const d = now.toISOString().slice(0,10);
  return { day:d, month:d.slice(0,7) };
}
function defaultState(now) {
  return { version:1, ...dateKeys(now), callsToday:0, callsThisMonth:0,
    reservedEstimatedUsd:0, reservations:[] };
}
function positiveInt(n) { return Number.isSafeInteger(n) && n >= 0; }

export function normalizedLedger(stored, now) {
  if (!stored || typeof stored !== "object" || stored.version !== 1 ||
      !positiveInt(stored.callsToday) || !positiveInt(stored.callsThisMonth) ||
      !Number.isFinite(stored.reservedEstimatedUsd) || stored.reservedEstimatedUsd < 0 ||
      !Array.isArray(stored.reservations) || stored.reservations.length > 10000) {
    throw Error("Invalid usage ledger; refusing API calls");
  }
  const {day,month}=dateKeys(now);
  // Monthly reservations should not disappear upon day rollover.
  // A monthly rollover is allowed only if there are no unsettled reservations.
  if (stored.month !== month) {
    if (stored.reservations.some(r=>r.status==="reserved")) {
      throw Error("Unsettled reservations across month boundary");
    }
    return defaultState(now);
  }
  const next = structuredClone(stored);
  if (next.day !== day) { next.day=day; next.callsToday=0; }
  return next;
}
export function canReserveLedgerCall(policy, ledger) {
  const p=validateBudgetPolicy(policy);
  if (!p.enabled || p.worstCaseUsdPerCall <= 0 ||
      p.maxCallsPerDay <= 0 || p.maxCallsPerMonth <= 0) return false;
  return ledger.callsToday < p.maxCallsPerDay &&
    ledger.callsThisMonth < p.maxCallsPerMonth &&
    ledger.reservedEstimatedUsd + p.worstCaseUsdPerCall <= p.maxEstimatedUsdPerMonth;
}
async function atomicJSON(path,data) {
  const temporary=path+".tmp-"+randomUUID();
  try {
    await writeFile(temporary,JSON.stringify(data,null,2),{flag:"wx",mode:0o600});
    await rename(temporary,path);
  } finally { await unlink(temporary).catch(()=>{}); }
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class UsageLedger {
  constructor(dir) { this.dir=resolve(dir);this.path=join(this.dir,"usage-ledger.json");this.lock=join(this.dir,"usage-ledger.lock"); }
  async exclusive(fn) {
    await mkdir(this.dir,{recursive:true,mode:0o700});
    let handle;
    for(let attempt=0;attempt<LOCK_RETRIES;attempt++){
      try {handle=await open(this.lock,"wx",0o600);break;}
      catch(e){if(e.code!=="EEXIST")throw e;await pause(LOCK_WAIT_MS);}
    }
    if(!handle)throw Error("Budget ledger busy or stale lock; refusing API calls");
    try {return await fn();}
    finally { await handle.close(); await unlink(this.lock).catch(()=>{}); }
  }
  async read(now=new Date()) {
    try {
      const raw=JSON.parse(await readFile(this.path,"utf8"));
      return normalizedLedger(raw,now);
    } catch(e) {
      if(e.code==="ENOENT")return defaultState(now);
      throw e;
    }
  }
  async reserve(policy,now=new Date()) {
    return this.exclusive(async()=>{
      const ledger=await this.read(now);
      if(!canReserveLedgerCall(policy,ledger))return null;
      const amount=validateBudgetPolicy(policy).worstCaseUsdPerCall;
      const reservation={id:randomUUID(),at:now.toISOString(),amount,status:"reserved"};
      ledger.callsToday++;
      ledger.callsThisMonth++;
      ledger.reservedEstimatedUsd=Math.round((ledger.reservedEstimatedUsd+amount)*1e6)/1e6;
      ledger.reservations.push(reservation);
      await atomicJSON(this.path,ledger);
      return {id:reservation.id,at:reservation.at};
    });
  }
  // Deliberately does not refund budget on failure: conservatively account
  // worst-case API cost until billing can be independently reconciled.
  async settle(id,now=new Date()) {
    return this.exclusive(async()=>{
      const ledger=await this.read(now);
      const record=ledger.reservations.find(r=>r.id===id);
      if(!record || record.status!=="reserved")throw Error("Unknown or settled reservation");
      record.status="settled";
      record.settledAt=now.toISOString();
      await atomicJSON(this.path,ledger);
      return {id,status:"settled"};
    });
  }
  async status(now=new Date()) {
    return this.exclusive(async()=> {
      const ledger=await this.read(now);
      return {day:ledger.day,month:ledger.month,callsToday:ledger.callsToday,
        callsThisMonth:ledger.callsThisMonth,reservedEstimatedUsd:ledger.reservedEstimatedUsd,
        unsettled:ledger.reservations.filter(r=>r.status==="reserved").length};
    });
  }
}
