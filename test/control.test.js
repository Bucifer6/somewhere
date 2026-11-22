import test from "node:test";
import assert from "node:assert/strict";
import {dispatch} from "../control/mcp.js";
import {eligible} from "../control/worker.js";

test("MCP advertises only read-only tools",async()=>{
  const r=await dispatch({jsonrpc:"2.0",id:1,method:"tools/list"});
  assert.deepEqual(r.result.tools.map(t=>t.name),["somewhere_health","somewhere_world","somewhere_roadmap"]);
});
test("MCP rejects arbitrary method",async()=>{
  const r=await dispatch({jsonrpc:"2.0",id:2,method:"shell/execute"});
  assert.equal(r.error.code,-32601);
});
test("MCP rejects extra tool parameters",async()=>{
  const r=await dispatch({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"somewhere_roadmap",arguments:{command:"rm -rf /"}}});
  assert.equal(r.result.isError,true);
});
test("worker requires explicit budget and provider key",()=>{
  const usage={month:"2026-11",day:"2026-11-22",callsToday:0,spentUsd:0};
  assert.equal(eligible({key:null,monthlyLimit:20,maxCalls:1,month:"2026-11",day:"2026-11-22"},usage),false);
  assert.equal(eligible({key:"key",monthlyLimit:0,maxCalls:1,month:"2026-11",day:"2026-11-22"},usage),false);
  assert.equal(eligible({key:"key",monthlyLimit:20,maxCalls:1,month:"2026-11",day:"2026-11-22"},usage),true);
  assert.equal(eligible({key:"key",monthlyLimit:20,maxCalls:1,month:"2026-11",day:"2026-11-22"},{...usage,callsToday:1}),false);
});
