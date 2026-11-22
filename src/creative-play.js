// Self-running, deterministic creative moments for Somewhere.
// Pure simulation only: no network, no providers, no writes outside saved world state.
const MOMENTS = Object.freeze([
  ["a lantern-making evening", "Lanterns drifted over Hearth as {a} and {b} traded stories under the stars."],
  ["a mysterious discovery", "{a} discovered a small bell in the grass. Nobody remembers who first brought it to Hearth."],
  ["an unexpected friendship", "{a} invited {b} on a walk beyond the village. They returned with a secret joke."],
  ["a tiny festival", "The villagers gathered for an improvised festival. {a} declared that everyone deserved a day of wonder."],
  ["a lost-and-found tale", "{b} returned a forgotten keepsake to {a}, who promised to look after it this time."],
  ["a curious visitor", "A travelling storyteller passed through Hearth, leaving {a} with a riddle about tomorrow."],
  ["a communal project", "{a} and {b} began building a small garden where anyone could leave a wish."],
  ["a surprising weather omen", "For an hour, the clouds over Hearth looked like paper boats. {a} was the first to notice."]
]);
const MAX_EVENTS=200;
const MAX_MEMORIES=12;
function hash(seed,day,salt) {
  let value=(seed + Math.imul(day,2654435761) + Math.imul(salt,1013904223)) >>> 0;
  value^=value>>>16; value=Math.imul(value,0x7feb352d);
  value^=value>>>15; value=Math.imul(value,0x846ca68b);
  return (value^(value>>>16))>>>0;
}
export function creativeMoment(world) {
  if (!world || !Number.isSafeInteger(world.day) || world.day<1 ||
      !Number.isSafeInteger(world.seed) || !Array.isArray(world.inhabitants) ||
      world.inhabitants.length===0) return null;
  const list=world.inhabitants.filter(p=>typeof p?.id==="string" && typeof p?.name==="string" && p.name.length<=80);
  if (!list.length) return null;
  const index=hash(world.seed,world.day,1)%MOMENTS.length;
  const a=list[hash(world.seed,world.day,2)%list.length];
  const b=list[(list.indexOf(a)+1+hash(world.seed,world.day,3)%Math.max(1,list.length-1))%list.length];
  const [kind,template]=MOMENTS[index];
  return {id:`moment-${world.day}`,day:world.day,kind,
    people:[a.id,...(b.id===a.id?[]:[b.id])],
    text:template.replaceAll("{a}",a.name).replaceAll("{b}",b.name)};
}
export function addCreativeMoment(world) {
  // Operates on a cloned world; safe for legacy persisted worlds with no memories.
  if (!world || world.hour!==18) return world;
  const event=creativeMoment(world);
  if (!event || world.events?.some(item=>item.id===event.id)) return world;
  world.events=[event,...(Array.isArray(world.events)?world.events:[])].slice(0,MAX_EVENTS);
  const related=new Set(event.people);
  world.inhabitants=world.inhabitants.map(person=>{
    if (!related.has(person.id)) return person;
    const memories=Array.isArray(person.memories)?person.memories.filter(x=>typeof x==="string").slice(-MAX_MEMORIES+1):[];
    return {...person,memories:[...memories,event.id]};
  });
  return world;
}
