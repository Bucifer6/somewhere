import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialWorld, advanceWorld } from "../src/world.js";
import { applyWorldAction, validateWorldAction } from "../src/world-action.js";
import { validateWorldActionBridge } from "../control/world-action-client.js";
const event=()=>({action:"create_event",requestId:randomUUID(),title:"A new discovery",story:"A glowing seed was found in the hollow tree."});
test("creative actions are disabled unless explicitly configured",()=>{
  assert.equal(validateWorldActionBridge({}),null);
  assert.throws(()=>validateWorldActionBridge({SOMEWHERE_WORLD_ACTION_KEY_FILE:"/etc/passwd"}),/Unsupported/);
});
test("creative event persists without changing original world; replay returns unchanged",()=>{
  const state=initialWorld(1847,0), input=event();
  const first=applyWorldAction(state,input,new Date(0));
  assert.equal(first.result.status,"applied");
  assert.equal(first.world.events[0].text,input.story);
  assert.equal(state.events.length,1);
  assert.equal(first.world.creativeActionsToday,1);
  const replay=applyWorldAction(first.world,input,new Date(1000));
  assert.equal(replay.result.status,"already-applied");
  assert.equal(replay.world,first.world);
});
test("new character preserves original IDs and increases Hearth population",()=>{
  const world=initialWorld(1847,0);
  const input={action:"introduce_character",requestId:randomUUID(),name:"Willow",description:"A cartographer searching for forgotten paths."};
  const next=applyWorldAction(world,input).world;
  assert.equal(next.inhabitants.length,9);
  assert.equal(next.settlements[0].population,9);
  assert.deepEqual(next.inhabitants.slice(0,8),world.inhabitants);
  assert.throws(()=>applyWorldAction(next,{...input,requestId:randomUUID()}),/already exists/);
  const tick=advanceWorld(next,0);
  assert.equal(tick.inhabitants.length,9);
});
test("projects participate in social life after an independent creative introduction",()=>{
  const world=initialWorld();
  const input={action:"start_project",requestId:randomUUID(),name:"The Starlight Orchard",description:"An orchard where every tree marks a memory."};
  const next=applyWorldAction(world,input).world;
  assert.equal(next.projects.length,1);
  assert.equal(next.projects[0].progress,0);
  next.hour=11;
  const after=advanceWorld(next,0);
  assert.equal(after.projects[0].progress,1);
});
test("rejects malformed requests, links, HTML, unwanted keys and invalid UUID",()=>{
  const valid=event();
  for(const bad of [
    {...valid,requestId:"../state"},
    {...valid,title:"<script>alert(1)</script>"},
    {...valid,story:"https://example.com please visit"},
    {...valid,story:"One\nTwo"},
    {...valid,command:"sh"},
    {...valid,action:"delete_world"},
    {...valid,story:"x".repeat(401)}
  ]) assert.throws(()=>validateWorldAction(bad));
});
test("eight changes per day maximum, cap resets on new day",()=>{
  let state=initialWorld();
  for(let i=0;i<8;i++) state=applyWorldAction(state,event()).world;
  assert.throws(()=>applyWorldAction(state,event()),/Daily/);
  state.day++;
  const result=applyWorldAction(state,event());
  assert.equal(result.world.creativeActionsToday,1);
  assert.equal(result.world.creativeActionIds.length,9);
});
test("full character/project/archive limits reject without mutating state",()=>{
  const world=initialWorld();
  const full={...world,inhabitants:Array.from({length:32},(_,i)=>({...world.inhabitants[0],id:"person-"+i,name:"Inhabitant "+i}))};
  assert.throws(()=>applyWorldAction(full,{action:"introduce_character",requestId:randomUUID(),name:"Birch",description:"A cheerful traveller."}),/limit/);
  const overflow={...world,creativeActionIds:Array.from({length:2048},(_,i)=>"id-"+i)};
  assert.throws(()=>applyWorldAction(overflow,event()),/registry full/);
});
