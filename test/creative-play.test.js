import test from "node:test";
import assert from "node:assert/strict";
import { initialWorld, advanceWorld } from "../src/world.js";
import { creativeMoment } from "../src/creative-play.js";

test("daily creative event is deterministic and unique",()=>{
  const a=initialWorld(1847,0);
  a.day=2; a.hour=17; a.tick=35;
  const b=structuredClone(a);
  const next=advanceWorld(a,0);
  const again=advanceWorld(b,0);
  assert.equal(next.hour,18);
  assert.deepEqual(next.events,again.events);
  const moment=next.events.find(e=>e.id==="moment-2");
  assert.ok(moment);
  assert.equal(moment.day,2);
  assert.ok(moment.text.length>30);
  assert.ok(moment.people.length>=1);
  assert.equal(a.events.length,1,"original state never mutated");
  const clone=structuredClone(next);
  clone.hour=17;
  const repeat=advanceWorld(clone,0);
  assert.equal(repeat.events.filter(e=>e.id==="moment-2").length,1);
});

test("involved inhabitants remember creative events, memory bounded",()=>{
  let w=initialWorld(1847,0);
  for(let day=1;day<=40;day++){
    w.day=day; w.hour=17;
    w=advanceWorld(w,day);
  }
  assert.ok(w.events.length>30);
  for(const person of w.inhabitants){
    assert.ok((person.memories??[]).length<=12);
    for(const id of person.memories??[]) assert.match(id,/^moment-\d+$/);
  }
});

test("creative moments preserve existing legacy world fields",()=>{
  const world=initialWorld();
  const event=creativeMoment(world);
  assert.ok(event);
  assert.equal(world.inhabitants[0].memories,undefined);
  assert.equal(creativeMoment({...world,inhabitants:[]}),null);
  assert.equal(creativeMoment({...world,seed:NaN}),null);
});

test("a future 200-event history cap is respected",()=>{
  let w=initialWorld();
  w.day=100; w.hour=17;
  w.events=Array.from({length:250},(_,i)=>({id:"old-"+i,day:1,text:"Old story"}));
  const next=advanceWorld(w,0);
  assert.equal(next.events.length,200);
  assert.equal(next.events[0].id,"moment-100");
});
