import test from "node:test";
import assert from "node:assert/strict";
import {validateBudgetPolicy,canReserveCall} from "../control/budget.js";
const policy={enabled:true,maxCallsPerDay:3,maxCallsPerMonth:30,maxEstimatedUsdPerMonth:10,worstCaseUsdPerCall:2};
const usage={callsToday:1,callsThisMonth:5,reservedEstimatedUsd:6};
test("budget rejects missing or invalid quotas",()=>{
  assert.throws(()=>validateBudgetPolicy({...policy,maxCallsPerDay:-1}),/Invalid/);
  assert.throws(()=>validateBudgetPolicy({...policy,worstCaseUsdPerCall:Infinity}),/Invalid/);
  assert.equal(canReserveCall({...policy,enabled:false},usage),false);
  assert.equal(canReserveCall({...policy,maxCallsPerDay:0},usage),false);
});
test("budget checks both call counts and worst-case reservation",()=>{
  assert.equal(canReserveCall(policy,usage),true);
  assert.equal(canReserveCall(policy,{...usage,callsToday:3}),false);
  assert.equal(canReserveCall(policy,{...usage,callsThisMonth:30}),false);
  assert.equal(canReserveCall(policy,{...usage,reservedEstimatedUsd:9}),false);
});
