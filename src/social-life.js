// Hearth's small autonomous social life. Pure deterministic rules, no paid AI or external IO.
// Migrates legacy persisted Genesis 0.2 worlds lazily without changing their version.
const PROJECTS = [
  {kind:"garden",name:"The Wish Garden",goal:5},
  {kind:"observatory",name:"The Lantern Observatory",goal:7},
  {kind:"library",name:"The Library of Little Things",goal:6},
  {kind:"bridge",name:"The Moonwater Footbridge",goal:8},
  {kind:"commons",name:"The Gathering House",goal:7}
];
const ACTS = [
  ["helped","{a} helped {b} repair an old wooden sign."],
  ["shared","{a} shared a treasured story with {b}."],
  ["explored","{a} and {b} followed a winding trail beyond Hearth."],
  ["learned","{b} taught {a} a new way to read the clouds."],
  ["cared","{a} checked on {b} after a long day."],
  ["made","{a} and {b} carved a little token of their friendship."]
];
function mix(seed,day,salt) {
  let x=(seed ^ Math.imul(day,0x9e3779b1) ^ Math.imul(salt,0x85ebca6b))>>>0;
  x^=x>>>16; x=Math.imul(x,0x7feb352d); x^=x>>>15;
  x=Math.imul(x,0x846ca68b); x^=x>>>16;
  return x>>>0;
}
const capped=(n,max)=>Math.min(max,Math.max(0,Number.isSafeInteger(n)?n:0));
const MAX_RELATIONSHIPS=40;
const MAX_PROJECTS=12;
const MAX_EVENTS=200;

function projectFor(world,ordinal) {
  const plan=PROJECTS[mix(world.seed,ordinal,19)%PROJECTS.length];
  return {id:`hearth-project-${ordinal}`,kind:plan.kind,name:plan.name,goal:plan.goal,
    progress:0,startedDay:world.day,completedDay:null,contributors:[]};
}
export function advanceSocialLife(world) {
  // One social decision per simulated day at noon, including on upgraded legacy saves.
  if (world.hour!==12 || !Array.isArray(world.inhabitants) || world.inhabitants.length<2 ||
      !Number.isSafeInteger(world.seed) || !Number.isSafeInteger(world.day) || world.day<1) return world;
  const eventId=`social-${world.day}`;
  if (world.events?.some(e=>e.id===eventId)) return world;
  const people=world.inhabitants.filter(p=>typeof p?.id==="string" && typeof p.name==="string").slice(0,100);
  if (people.length<2) return world;
  const ia=mix(world.seed,world.day,11)%people.length;
  const ib=(ia+1+(mix(world.seed,world.day,12)%(people.length-1)))%people.length;
  const a=people[ia],b=people[ib];
  const [verb,template]=ACTS[mix(world.seed,world.day,13)%ACTS.length];
  const key=[a.id,b.id].sort().join(":");
  const relationships=Array.isArray(world.relationships)?world.relationships.filter(r=>
    r && typeof r.key==="string" && Array.isArray(r.people) && r.people.length===2 &&
    Number.isSafeInteger(r.strength) && r.strength>=1 && r.strength<=5).slice(-MAX_RELATIONSHIPS):[];
  const current=relationships.find(r=>r.key===key);
  const bond=current?{...current,strength:capped(current.strength+1,5),lastDay:world.day}
    :{key,people:[a.id,b.id].sort(),strength:1,lastDay:world.day};
  world.relationships=[...relationships.filter(r=>r.key!==key),bond].slice(-MAX_RELATIONSHIPS);

  const projects=Array.isArray(world.projects)?world.projects.filter(p=>p && typeof p.id==="string" &&
    Number.isSafeInteger(p.progress) && Number.isSafeInteger(p.goal) && p.goal>0 &&
    p.progress>=0 && p.progress<=p.goal).slice(-MAX_PROJECTS):[];
  let active=projects.find(p=>p.completedDay===null);
  if (!active && projects.length < MAX_PROJECTS) {
    active=projectFor(world,projects.length+1);
    projects.push(active);
  }
  let milestone=null;
  if (active) {
    active.progress=Math.min(active.goal,active.progress+1);
    active.contributors=Array.from(new Set([...(Array.isArray(active.contributors)?active.contributors:[]),a.id,b.id])).slice(0,100);
    if (active.progress===active.goal) {
      active.completedDay=world.day;
      milestone={id:`project-complete-${active.id}`,day:world.day,
        text:`Hearth celebrated the completion of ${active.name}. Everyone had helped make it real.`,kind:"milestone"};
    }
  }
  world.projects=projects;
  const text=template.replaceAll("{a}",a.name).replaceAll("{b}",b.name);
  const event={id:eventId,day:world.day,kind:"social",verb,people:[a.id,b.id],text};
  world.events=[...(milestone?[milestone]:[]),event,...(Array.isArray(world.events)?world.events:[])].slice(0,MAX_EVENTS);
  return world;
}
