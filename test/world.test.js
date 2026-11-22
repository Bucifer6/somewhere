import test from "node:test";
import assert from "node:assert/strict";
import { initialWorld, advanceWorld } from "../src/world.js";

test("genesis contains eight unique inhabitants", () => {
  const w = initialWorld(123, 0);
  assert.equal(w.inhabitants.length, 8);
  assert.equal(new Set(w.inhabitants.map(p=>p.id)).size, 8);
  assert.equal(w.day, 1);
});

test("the world advances deterministically and doesn't mutate previous state", () => {
  const w = initialWorld(123, 0);
  const a = advanceWorld(w, 60_000);
  const b = advanceWorld(w, 60_000);
  assert.deepEqual(a, b);
  assert.equal(w.tick, 0);
  assert.equal(a.tick, 1);
  assert.equal(a.hour, 7);
});

test("days and seasons advance, and the event history is bounded", () => {
  let w = initialWorld(123, 0);
  for(let i=0;i<24*95;i++) w=advanceWorld(w, i*60_000);
  assert.equal(w.day, 96);
  assert.equal(w.season, "winter");
  assert.ok(w.events.length <= 200);
  assert.ok(w.inhabitants.every(p=>p.x>=5&&p.x<=95&&p.y>=5&&p.y<=95));
});
