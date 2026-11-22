import test from "node:test";
import assert from "node:assert/strict";
import {initialWorld,advanceWorld} from "../src/world.js";

test("inhabitants independently form lasting relationships and begin a village project",()=>{
  let world=initialWorld(1847,0);
  world.hour=11;
  const original=structuredClone(world);
  const updated=advanceWorld(world,0);
  assert.deepEqual(world,original,"previous state remains unmodified");
  assert.equal(updated.hour,12);
  assert.equal(updated.events.filter(e=>e.id==="social-1").length,1);
  assert.equal(updated.relationships.length,1);
  assert.equal(updated.relationships[0].strength,1);
  assert.equal(updated.projects.length,1);
  assert.equal(updated.projects[0].progress,1);
});
test("social decisions are deterministic, idempotent and bounded",()=>{
  const a=initialWorld(1847,0);
  a.day=14;a.hour=11;
  const b=structuredClone(a);
  assert.deepEqual(advanceWorld(a,0),advanceWorld(b,0));
  const once=advanceWorld(a,0);
  once.hour=11;
  const twice=advanceWorld(once,0);
  assert.equal(twice.events.filter(e=>e.id==="social-14").length,1);
  assert.equal(twice.projects[0].progress,1);
  let state=initialWorld(1847,0);
  for(let day=1;day<=100;day++){
    state.day=day;state.hour=11;
    state=advanceWorld(state,day);
  }
  assert.ok(state.relationships.length<=40);
  assert.ok(state.projects.length<=12);
  assert.ok(state.events.length<=200);
  assert.ok(state.projects.some(p=>p.completedDay!==null));
  assert.ok(state.projects.every(p=>p.progress<=p.goal));
  assert.equal(new Set(state.events.map(e=>e.id)).size,state.events.length);
});
test("legacy snapshots upgrade without changing their world version",()=>{
  const old=initialWorld(1847,0);
  delete old.relationships;delete old.projects;
  old.day=7;old.hour=11;
  const next=advanceWorld(old,0);
  assert.equal(next.version,1);
  assert.equal(old.relationships,undefined);
  assert.ok(next.relationships.length>0);
  assert.ok(next.projects.length>0);
  assert.equal(next.inhabitants.length,8);
  assert.equal(next.settlements[0].id,"hearth");
});
test("midday social decisions and evening creative moments coexist",()=>{
  const world=initialWorld(1847,0);
  world.day=3;world.hour=11;
  let next=advanceWorld(world,0);
  for(let i=0;i<6;i++) next=advanceWorld(next,0);
  assert.ok(next.events.some(e=>e.id==="social-3"));
  assert.ok(next.events.some(e=>e.id==="moment-3"));
});
