export const WORLD_VERSION = 1;

export function initialWorld(seed = 1847, now = Date.now()) {
  return {
    version: WORLD_VERSION,
    seed,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    day: 1,
    hour: 6,
    tick: 0,
    season: "spring",
    settlements: [{ id: "hearth", name: "Hearth", x: 48, y: 52, population: 8, foundedDay: 1 }],
    inhabitants: Array.from({ length: 8 }, (_, i) => ({
      id: `person-${i + 1}`,
      name: ["Ari", "Mira", "Sol", "Neri", "Elio", "Tala", "Orin", "Luma"][i],
      x: 42 + (i * 7) % 20,
      y: 46 + (i * 11) % 15,
      mood: "curious"
    })),
    events: [{ id: "genesis", day: 1, text: "Eight travellers founded the village of Hearth." }]
  };
}

function random(seed) {
  let n = (seed ^ (seed >>> 16)) >>> 0;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

export function advanceWorld(world, now = Date.now()) {
  const next = structuredClone(world);
  next.tick += 1;
  next.hour = (next.hour + 1) % 24;
  if (next.hour === 0) next.day += 1;
  const seasons = ["spring", "summer", "autumn", "winter"];
  next.season = seasons[Math.floor((next.day - 1) / 30) % 4];
  next.updatedAt = new Date(now).toISOString();

  next.inhabitants = next.inhabitants.map((p, i) => {
    const rollX = random(next.seed + next.tick * 101 + i * 11);
    const rollY = random(next.seed + next.tick * 127 + i * 17);
    const mood = ["curious", "content", "thoughtful", "hopeful"][Math.floor(random(next.seed + next.tick * 71 + i) * 4)];
    return {
      ...p,
      x: Math.max(5, Math.min(95, p.x + (rollX - 0.5) * 2)),
      y: Math.max(5, Math.min(95, p.y + (rollY - 0.5) * 2)),
      mood
    };
  });

  if (next.hour === 6) {
    const visitor = next.inhabitants[next.day % next.inhabitants.length];
    next.events.unshift({
      id: `dawn-${next.day}`,
      day: next.day,
      text: `A new dawn arrived in Hearth. ${visitor.name} went exploring.`
    });
    next.events = next.events.slice(0, 200);
  }
  return next;
}
