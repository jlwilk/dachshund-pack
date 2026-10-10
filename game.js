// Dachshund Pack: a lane defence. Your pack of wiener dogs holds the road
// while everything comes at it: gates that grow (or shrink) the pack slide
// toward you, you steer left and right to pick one, and every pup fights the
// oncoming badgers in its own way. Now and then fences split the
// lane in three: a crate of pups to shoot open on one side, the badger horde
// in the middle, and a tougher cage with a bigger prize on the other.
// A Badger King waits at the end.
// Everything here is pure. World units are metres: x across the lane
// (0 is the middle), y along it (forward is +y). Times are in seconds.

import { LEVEL } from './level.js';

export const LANE_HALF = 5;
// How fast the road (gates, crates, fences) comes toward the pack. In world
// terms the pack moves up the lane at this speed; the camera hides that.
export const RUN_SPEED = 4;
export const STEER_SPEED = 9; // how fast the pack slides sideways toward where you're steering
export const MAX_PUPS = 300;
export const PUP_RADIUS = 0.3;
// A big pack merges: MERGE_COUNT pups of one breed become a Big dog,
// MERGE_COUNT Big dogs a Mega-long dog, and so on up to Ultra-long. Merging starts once there are
// MERGE_AT of a kind, so a few loose pups always stay loose.
export const MERGE_COUNT = 5;
export const MERGE_AT = 6;
export const TIERS = [
  null,
  { name: 'Pup', scale: 1 },
  { name: 'Big', scale: 1.15 }, // merged dogs get a little wider and a lot longer
  { name: 'Mega-long', scale: 1.3 },
  { name: 'Ultra-long', scale: 1.45 },
];
export const unitRadius = p => PUP_RADIUS * TIERS[p.tier].scale;
// In a split, fences at ±DIVIDER_X make three lanes; crates sit in the outer two.
export const DIVIDER_X = LANE_HALF / 3;
export const CRATE = { width: 2.6, depth: 1.0 };
export const SPAWN_AHEAD = 45; // waves appear this far up the road and march at you
// Badgers get tougher the further you get: by the King they have this many times more health.
export const HP_RAMP = 4.5;
const SLOT_SPACING = 0.44;
const FORMATION_EASE = 8;
const SUBSTEP = 1 / 120;
// After a bite, a dog shakes it off for a moment before it can be bitten again.
const BITE_GUARD = 0.35;

// What each kind of pup does. Ranges in metres, cooldowns in seconds.
export const BREEDS = {
  // Barks: a quick single shot. The basic unit.
  smooth: { label: 'Smooth', hp: 1, attack: 'bark', range: 20, cooldown: 0.6, damage: 1 },
  // Bristle spray: three short darts in a fan, good against crowds.
  wire: { label: 'Wire-haired', hp: 1, attack: 'bristles', range: 12, cooldown: 0.9, damage: 0.7 },
  // Floof shield: takes three bites, runs at the front, and barks a little.
  long: { label: 'Long-haired', hp: 3, attack: 'bark', range: 14, cooldown: 1.0, damage: 0.5 },
  // Zoomies: dashes into the nearest badger, bowling it over, then runs back.
  dapple: { label: 'Dapple', hp: 1, attack: 'dash', range: 12, cooldown: 2.5, damage: 3 },
};

export const BADGERS = {
  badger: { hp: 2, speed: 1.6, radius: 0.4 },
  honey: { hp: 2, speed: 3.2, radius: 0.35 }, // honey badger don't care
  armored: { hp: 8, speed: 1.2, radius: 0.5 }, // bucket helmet
};

export const BOSS = { hp: 1600, radius: 1.6, speed: 0.6, throwEvery: 1.2, clodSpeed: 7, stopShort: 9 };

const PROJECTILES = {
  bark: { speed: 24, radius: 0.2, life: 0.9 },
  bristle: { speed: 16, radius: 0.12, life: 0.8 },
  clod: { speed: BOSS.clodSpeed, radius: 0.3, life: 2.5 },
};
const DASH_SPEED = 20;
const BEHIND = 7; // badgers this far behind the pack give up

// Seeded random numbers, so a run (and a test) can be replayed exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newPup = (id, breed, ox = 0, oy = 0) => ({ id, breed, ox, oy, tier: 1, size: 1, hp: BREEDS[breed].hp, cooldown: 0, dash: null });

// How many pups a dog is worth: a merged dog shrinks by one pup per lost life's worth.
const withHp = (p, hp) => ({ ...p, hp, size: Math.ceil(hp / BREEDS[p.breed].hp - 1e-9) });

// How many pups in the pack, counting what each merged dog is worth.
export const packSize = game => game.pups.reduce((n, p) => n + p.size, 0);

export function createGame({ level = LEVEL, seed = 1 } = {}) {
  return {
    level,
    seed,
    rng: seed,
    time: 0,
    pack: { x: 0, y: 0 },
    steer: 0,
    pups: [newPup(1, 'smooth')],
    nextId: 2,
    nextBadger: 1,
    gatesPassed: 0,
    wavesSpawned: 0,
    badgers: [],
    crates: cratesFor(level),
    shots: [],
    boss: null,
    kills: 0,
    phase: 'running', // running → boss → won | lost
  };
}

// Each split has a crate in its left lane and a cage in its right, just
// before the split ends. Shoot one open (or ram it) and its pups join you.
export function cratesFor(level) {
  return (level.splits ?? []).flatMap((split, i) => ['left', 'right'].map(side => ({
    id: `${i}${side[0]}`,
    side,
    cage: side === 'right',
    x: (side === 'left' ? -1 : 1) * (DIVIDER_X + LANE_HALF) / 2,
    y: split.d + split.length - CRATE.depth,
    hp: split[side].hp,
    maxHp: split[side].hp,
    reward: split[side].reward,
    broken: false,
    hit: 0,
  })));
}

export const splitAt = (level, y) => (level.splits ?? []).find(s => y >= s.d && y <= s.d + s.length) ?? null;

// Distance from a point to a crate's footprint (0 if inside), and the closest point on it.
export function crateContact(crate, at) {
  const x = Math.max(crate.x - CRATE.width / 2, Math.min(crate.x + CRATE.width / 2, at.x));
  const y = Math.max(crate.y - CRATE.depth / 2, Math.min(crate.y + CRATE.depth / 2, at.y));
  return { x, y, d: Math.hypot(at.x - x, at.y - y) };
}

// Sunflower formation: each dog sits on a golden-angle spiral, spaced by how
// wide it is (merged dogs grow longer much more than wider), so any pack
// packs into a tidy blob.
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export function formation(sizes) {
  const list = typeof sizes === 'number' ? Array(sizes).fill(1) : sizes;
  const slots = [];
  let area = 0;
  list.forEach((scale, i) => {
    const room = SLOT_SPACING ** 2 * scale;
    const r = i ? Math.sqrt(area + room / 2) : 0;
    area += room;
    slots.push({ x: Math.cos(i * GOLDEN) * r, y: Math.sin(i * GOLDEN) * r, scale });
  });
  return slots;
}

export const packRadius = n => SLOT_SPACING * Math.sqrt(Math.max(1, n));

const FRONT_ORDER = { long: 0, smooth: 1, wire: 1, dapple: 2 };
function assignSlots(pups) {
  // The big long dogs lead from the front, their backs stretching out ahead;
  // then long-haired pups, then everyone else.
  const order = pups.map((p, i) => i).sort((a, b) => pups[b].tier - pups[a].tier
    || FRONT_ORDER[pups[a].breed] - FRONT_ORDER[pups[b].breed] || pups[a].id - pups[b].id);
  const slots = formation(order.map(i => TIERS[pups[i].tier].scale)).sort((a, b) => b.y - a.y);
  const target = new Array(pups.length);
  order.forEach((pupIndex, k) => {
    target[pupIndex] = slots[k];
  });
  return target;
}

// How far the pack sticks out either side of its middle.
const packHalfWidth = (pups, slots) => pups.reduce((w, p, i) => Math.max(w, Math.abs(slots[i].x) + unitRadius(p)), PUP_RADIUS);

// Merge whenever there are enough dogs of the same breed and size.
export function mergePack(game, events = []) {
  let { pups, nextId } = game;
  for (let tier = 1; tier < TIERS.length - 1; tier++) {
    for (const breed of Object.keys(BREEDS)) {
      for (;;) {
        const same = pups.filter(p => p.breed === breed && p.tier === tier && !p.dash);
        if (same.length < MERGE_AT) break;
        const parts = same.slice(0, MERGE_COUNT);
        const ids = new Set(parts.map(p => p.id));
        const big = {
          ...newPup(nextId++, breed, parts.reduce((s, p) => s + p.ox, 0) / parts.length, parts.reduce((s, p) => s + p.oy, 0) / parts.length),
          tier: tier + 1,
        };
        const merged = withHp(big, parts.reduce((s, p) => s + p.hp, 0));
        pups = [...pups.filter(p => !ids.has(p.id)), merged];
        events.push({ type: 'merge', breed, tier: tier + 1, x: game.pack.x + merged.ox, y: game.pack.y + merged.oy });
      }
    }
  }
  return pups === game.pups ? game : { ...game, pups, nextId };
}

export const pupPosition = (game, p) => ({ x: game.pack.x + p.ox, y: game.pack.y + p.oy });

// --- Gates ---------------------------------------------------------------

export function gateLabel(op) {
  if (op.add) return `+${op.add}${op.breed ? ` ${BREEDS[op.breed].label}` : ''}`;
  if (op.mul) return `×${op.mul}`;
  if (op.sub) return `−${op.sub}`;
  return `÷${op.div}`;
}

export const gateIsGood = op => Boolean(op.add || op.mul);

// How many pups you'd have after going through a gate (or opening a crate).
export const gatePreview = (game, op) => packSize(applyGate(game, op));

// Lose n pups' worth, smallest dogs first, so a gate nibbles at the edges of the pack.
function losePups(pups, n) {
  const order = pups.map((p, i) => i).sort((a, b) => pups[a].tier - pups[b].tier || pups[b].id - pups[a].id);
  const next = pups.slice();
  let left = n;
  for (const i of order) {
    if (left <= 0) break;
    const take = Math.min(left, next[i].size);
    left -= take;
    next[i] = withHp(next[i], next[i].hp - take * BREEDS[next[i].breed].hp);
  }
  return next.filter(p => p.size > 0);
}

export function applyGate(game, op) {
  let { pups, nextId } = game;
  const total = packSize(game);
  // New pups join from just behind the middle and run to their slots.
  const spawn = breed => newPup(nextId, breed, (((nextId++ * 0.618) % 1) - 0.5) * 0.4, -0.3);
  if (op.add) {
    const room = Math.max(0, MAX_PUPS - total);
    pups = [...pups, ...Array.from({ length: Math.min(op.add, room) }, () => spawn(op.breed ?? 'smooth'))];
  } else if (op.mul) {
    // Every dog gets copies of itself, big dogs included, up to the cap.
    let room = MAX_PUPS - total;
    const extra = [];
    for (let k = 1; k < op.mul; k++) {
      for (const p of pups) {
        if (p.size > room) continue;
        room -= p.size;
        extra.push({ ...p, id: nextId++, ox: p.ox * 0.5, oy: p.oy - 0.3, cooldown: 0, dash: null });
      }
    }
    pups = [...pups, ...extra];
  } else if (op.sub) {
    pups = losePups(pups, op.sub);
  } else if (op.div) {
    pups = losePups(pups, total - Math.ceil(total / op.div));
  }
  return mergePack({ ...game, pups, nextId });
}

// --- Stepping ------------------------------------------------------------

export function step(game, dt, { steerX = game.steer } = {}) {
  if (game.phase === 'won' || game.phase === 'lost') return { state: game, events: [] };
  // Steering past where the pack can go would only have to be unwound later.
  const limit = steerLimit(game);
  let g = { ...game, steer: Math.max(-limit, Math.min(limit, steerX)) };
  const events = [];
  for (let t = dt; t > 1e-9 && (g.phase === 'running' || g.phase === 'boss'); t -= SUBSTEP) {
    g = substep(g, Math.min(SUBSTEP, t), events);
  }
  return { state: g, events };
}

function substep(game, dt, events) {
  const rng = mulberry32(game.rng);
  let g = { ...game, time: game.time + dt, rng: Math.floor(rng() * 4294967296) };

  g = movePack(g, dt);
  g = passGates(g, events);
  g = spawnWaves(g, rng);
  g = moveBadgers(g, dt);
  g = fight(g, dt, events);
  g = moveShots(g, dt, events);
  g = clashes(g, events);
  g = openCrates(g, events);

  if (g.pups.length === 0) {
    events.push({ type: 'lost' });
    return { ...g, phase: 'lost' };
  }
  if (g.boss && g.boss.hp <= 0) {
    events.push({ type: 'won' });
    return { ...g, phase: 'won', kills: g.kills + 1, boss: { ...g.boss, hp: 0 } };
  }
  return g;
}

// How far the pack's middle can go either side before its edge hits the side of the road.
export const steerLimit = game => Math.max(0, LANE_HALF - packHalfWidth(game.pups, assignSlots(game.pups)));

function movePack(g, dt) {
  const slots = assignSlots(g.pups);
  // Keep the whole blob inside the lane.
  const edge = Math.max(0, LANE_HALF - packHalfWidth(g.pups, slots));
  const want = Math.max(-edge, Math.min(edge, g.steer));
  const dx = Math.max(-STEER_SPEED * dt, Math.min(STEER_SPEED * dt, want - g.pack.x));
  // The pack halts in front of the Badger King to fight him.
  const halt = g.boss && g.pack.y >= g.boss.y - BOSS.stopShort;
  const pack = { x: g.pack.x + dx, y: g.pack.y + (halt ? 0 : RUN_SPEED * dt) };

  const ease = Math.min(1, FORMATION_EASE * dt);
  const pups = g.pups.map((p, i) => {
    if (p.dash) return p;
    const ox = p.ox + (slots[i].x - p.ox) * ease;
    const oy = p.oy + (slots[i].y - p.oy) * ease;
    return { ...p, ox: ox + bumpAround(g.crates, pack.x + ox, pack.y + oy), oy };
  });
  let boss = g.boss;
  if (!boss && pack.y >= g.level.boss.d - 16) {
    boss = { x: 0, y: g.level.boss.d, hp: BOSS.hp, maxHp: BOSS.hp, throwIn: 2 };
  }
  return { ...g, pack, pups, boss, phase: boss ? 'boss' : g.phase };
}

// A pup that runs into a crate it hasn't opened squeezes past it on whichever
// side is nearer (staying in the lane). Returns how far to shift it sideways.
function bumpAround(crates, x, y) {
  for (const c of crates) {
    if (c.broken || Math.abs(y - c.y) > CRATE.depth / 2 + PUP_RADIUS) continue;
    const half = CRATE.width / 2 + PUP_RADIUS;
    if (Math.abs(x - c.x) >= half) continue;
    const outer = c.x + Math.sign(c.x) * half;
    const inner = c.x - Math.sign(c.x) * half;
    const roomOutside = Math.abs(outer) <= LANE_HALF - PUP_RADIUS;
    const to = roomOutside && Math.abs(x - outer) < Math.abs(x - inner) ? outer : inner;
    return to - x;
  }
  return 0;
}

function passGates(g, events) {
  const gate = g.level.gates[g.gatesPassed];
  if (!gate || g.pack.y < gate.d) return g;
  const side = g.pack.x < 0 ? 'left' : 'right';
  const op = gate[side];
  const before = packSize(g);
  const next = applyGate({ ...g, gatesPassed: g.gatesPassed + 1 }, op);
  events.push({ type: 'gate', side, op, before, after: packSize(next) });
  return next;
}

function spawnWaves(g, rng) {
  let { wavesSpawned, badgers, nextBadger } = g;
  const waves = g.level.waves;
  while (wavesSpawned < waves.length && g.pack.y >= waves[wavesSpawned].d - SPAWN_AHEAD) {
    const w = waves[wavesSpawned++];
    const kind = BADGERS[w.kind];
    // A wave inside a split keeps to the middle lane until the pack is through it.
    const split = splitAt(g.level, w.d);
    const half = split ? DIVIDER_X : LANE_HALF;
    const fresh = Array.from({ length: w.count }, () => ({
      id: nextBadger++,
      kind: w.kind,
      until: split ? split.d + split.length : null,
      x: (rng() * 2 - 1) * (half - kind.radius),
      y: w.d + rng() * w.spread,
      hp: toughness(g.level, w.d) * kind.hp,
      maxHp: toughness(g.level, w.d) * kind.hp,
      hit: 0,
    }));
    badgers = [...badgers, ...fresh];
  }
  return { ...g, wavesSpawned, badgers, nextBadger };
}

export const toughness = (level, d) => 1 + (HP_RAMP - 1) * Math.min(1, d / level.boss.d);

function nearestPup(g, at) {
  let best = null;
  let bestD = Infinity;
  for (const p of g.pups) {
    const pos = pupPosition(g, p);
    const d = Math.hypot(pos.x - at.x, pos.y - at.y);
    if (d < bestD) {
      best = pos;
      bestD = d;
    }
  }
  return best;
}

function moveBadgers(g, dt) {
  const badgers = g.badgers
    .map(b => {
      const kind = BADGERS[b.kind];
      // Charge down the lane, swerving toward the closest pup.
      const target = nearestPup(g, b) ?? g.pack;
      const dx = target.x - b.x;
      const dy = target.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const vx = (dx / d) * kind.speed;
      const vy = dy < 0 ? (dy / d) * kind.speed : -kind.speed * 0.3;
      const y = b.y + vy * dt;
      // The split's fences keep the horde in the middle lane.
      const fenced = (b.until !== null && g.pack.y < b.until) || (splitAt(g.level, y) && Math.abs(b.x) < DIVIDER_X);
      const half = fenced ? DIVIDER_X - kind.radius : LANE_HALF;
      return {
        ...b,
        x: Math.max(-half, Math.min(half, b.x + vx * dt)),
        y,
        hit: Math.max(0, b.hit - dt),
      };
    })
    .filter(b => b.y > g.pack.y - BEHIND);
  let boss = g.boss;
  if (boss && boss.hp > 0) {
    // The King lumbers toward the pack once it has stopped to face him.
    const close = boss.y - g.pack.y;
    const y = close > BOSS.stopShort * 0.6 ? boss.y - BOSS.speed * dt : boss.y;
    const x = boss.x + Math.sign(g.pack.x - boss.x) * Math.min(Math.abs(g.pack.x - boss.x), BOSS.speed * dt);
    boss = { ...boss, x, y, hit: Math.max(0, (boss.hit ?? 0) - dt) };
  }
  const crates = g.crates.map(c => (c.hit > 0 ? { ...c, hit: Math.max(0, c.hit - dt) } : c));
  return { ...g, badgers, crates, boss };
}

// Pups shoot what's ahead of them: a badger has to be within this angle of
// straight ahead, unless it's already close.
const AIM_CONE = (35 * Math.PI) / 180;
const POINT_BLANK = 1.8;
const ahead = (at, x, y, d) => d < POINT_BLANK || Math.abs(Math.atan2(x - at.x, y - at.y)) < AIM_CONE;

// Every target a pup can attack from where it stands: badgers ahead of it,
// the crate in its own lane (aimed at its closest point) and the King.
function targets(g, at) {
  const list = [];
  for (const b of g.badgers) {
    const d = Math.hypot(b.x - at.x, b.y - at.y) - BADGERS[b.kind].radius;
    if (ahead(at, b.x, b.y, d)) list.push({ x: b.x, y: b.y, d });
  }
  for (const c of g.crates) {
    if (!c.broken && Math.abs(at.x - c.x) < CRATE.width / 2 + PUP_RADIUS) list.push(crateContact(c, at));
  }
  if (g.boss && g.boss.hp > 0) list.push({ x: g.boss.x, y: g.boss.y, d: Math.hypot(g.boss.x - at.x, g.boss.y - at.y) - BOSS.radius });
  return list;
}

function fight(g, dt, events) {
  const shots = [...g.shots];
  let boss = g.boss;
  const badgers = g.badgers.slice();
  const crates = g.crates.slice();
  let kills = g.kills;

  const pups = g.pups.map(p => {
    const breed = BREEDS[p.breed];
    const pos = pupPosition(g, p);
    if (p.dash) return dashStep(g, p, pos, dt, badgers, crates, events, b => (boss = b), () => kills++);
    const cooldown = Math.max(0, p.cooldown - dt);
    if (cooldown > 0) return { ...p, cooldown };
    let best = null;
    let bestD = breed.range;
    for (const f of targets(g, pos)) {
      if (f.d < bestD) {
        best = f;
        bestD = f.d;
      }
    }
    if (!best) return { ...p, cooldown: 0 };
    const angle = Math.atan2(best.y - pos.y, best.x - pos.x);
    // A merged dog hits as hard as all the pups it's made of.
    if (breed.attack === 'bark') {
      shots.push(shot('bark', pos, angle, breed.damage * p.size, p.tier));
    } else if (breed.attack === 'bristles') {
      for (const spread of [-0.26, 0, 0.26]) shots.push(shot('bristle', pos, angle + spread, breed.damage * p.size, p.tier));
    } else {
      return { ...p, cooldown: breed.cooldown, dash: { tx: best.x, ty: best.y, back: false, hit: [] } };
    }
    return { ...p, cooldown: breed.cooldown };
  });
  return { ...g, pups, shots, badgers, crates, boss, kills };
}

const shot = (kind, from, angle, damage, tier = 1) => {
  const k = PROJECTILES[kind];
  return { kind, tier, x: from.x, y: from.y, vx: Math.cos(angle) * k.speed, vy: Math.sin(angle) * k.speed, damage, life: k.life, foe: false };
};

// A dapple's zoomies: out to the target, bowling over anything on the way, then home.
function dashStep(g, p, pos, dt, badgers, crates, events, setBoss, countKill) {
  const d = p.dash;
  const goal = d.back ? { x: g.pack.x, y: g.pack.y } : { x: d.tx, y: d.ty };
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = DASH_SPEED * dt;
  const moved = dist <= stepLen ? goal : { x: pos.x + (dx / dist) * stepLen, y: pos.y + (dy / dist) * stepLen };
  const hit = d.hit.slice();
  const r = unitRadius(p);
  const power = BREEDS.dapple.damage * p.size;
  for (let i = 0; i < badgers.length; i++) {
    const b = badgers[i];
    if (b.hp <= 0 || hit.includes(b.id)) continue;
    if (Math.hypot(b.x - moved.x, b.y - moved.y) < BADGERS[b.kind].radius + r) {
      hit.push(b.id);
      badgers[i] = damage(b, power, events, countKill);
    }
  }
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (c.broken || hit.includes(c.id) || crateContact(c, moved).d > r) continue;
    hit.push(c.id);
    crates[i] = { ...c, hp: c.hp - power, hit: 0.15 };
  }
  if (g.boss && g.boss.hp > 0 && !hit.includes('boss') && Math.hypot(g.boss.x - moved.x, g.boss.y - moved.y) < BOSS.radius + r) {
    hit.push('boss');
    setBoss({ ...g.boss, hp: g.boss.hp - power, hit: 0.15 });
  }
  const arrived = dist <= stepLen;
  const ox = moved.x - g.pack.x;
  const oy = moved.y - g.pack.y;
  if (arrived && d.back) return { ...p, ox, oy, dash: null };
  return { ...p, ox, oy, dash: { ...d, back: d.back || arrived, hit } };
}

function damage(b, amount, events, countKill) {
  const hp = b.hp - amount;
  if (hp <= 0 && b.hp > 0) {
    countKill();
    events.push({ type: 'bop', x: b.x, y: b.y, kind: b.kind });
  }
  return { ...b, hp, hit: 0.15 };
}

function moveShots(g, dt, events) {
  const crates = g.crates.slice();
  let badgers = g.badgers.slice();
  let boss = g.boss;
  let pups = g.pups;
  let kills = g.kills;
  const shots = [];
  for (const s of g.shots) {
    const next = { ...s, x: s.x + s.vx * dt, y: s.y + s.vy * dt, life: s.life - dt };
    if (next.life <= 0) continue;
    const r = PROJECTILES[s.kind].radius;
    if (s.foe) {
      // A dirt clod from the King: the first pup it hits takes a knock.
      const victim = pups.findIndex(p => {
        const pos = pupPosition(g, p);
        return !p.dash && Math.hypot(pos.x - next.x, pos.y - next.y) < r + unitRadius(p);
      });
      if (victim >= 0) {
        pups = pups.map((p, i) => (i === victim ? withHp(p, p.hp - 1) : p)).filter(p => p.hp > 0);
        events.push({ type: 'splat', x: next.x, y: next.y });
        continue;
      }
      shots.push(next);
      continue;
    }
    const i = badgers.findIndex(b => b.hp > 0 && !(s.through ?? []).includes(b.id) && Math.hypot(b.x - next.x, b.y - next.y) < r + BADGERS[b.kind].radius);
    if (i >= 0) {
      // A big bark blasts straight through: whatever it doesn't need for this
      // badger carries on to the next one.
      const left = s.damage - badgers[i].hp;
      badgers[i] = damage(badgers[i], s.damage, events, () => kills++);
      if (left > 1e-9) shots.push({ ...next, damage: left, through: [...(s.through ?? []), badgers[i].id] });
      continue;
    }
    const c = crates.findIndex(k => !k.broken && k.hp > 0 && crateContact(k, next).d < r);
    if (c >= 0) {
      crates[c] = { ...crates[c], hp: crates[c].hp - s.damage, hit: 0.15 };
      continue;
    }
    if (boss && boss.hp > 0 && Math.hypot(boss.x - next.x, boss.y - next.y) < r + BOSS.radius) {
      boss = { ...boss, hp: boss.hp - s.damage, hit: 0.15 };
      continue;
    }
    shots.push(next);
  }
  // The King hurls dirt clods at the pack.
  if (boss && boss.hp > 0) {
    let throwIn = boss.throwIn - dt;
    if (throwIn <= 0 && pups.length) {
      const target = pupPosition(g, pups[Math.floor(mulberry32(g.rng ^ 0x9e3779b9)() * pups.length)]);
      const angle = Math.atan2(target.y - boss.y, target.x - boss.x);
      shots.push({ ...shot('clod', { x: boss.x, y: boss.y - BOSS.radius * 0.6 }, angle, 1), foe: true });
      throwIn = BOSS.throwEvery;
    }
    boss = { ...boss, throwIn };
  }
  return { ...g, badgers: badgers.filter(b => b.hp > 0), crates, boss, pups, kills, shots };
}

// Badgers that reach the pack bite: each bite costs a pup a life and the
// badger a point of health (more from a big dog). Long-haired pups can take
// three. A merged dog loses one pup's worth per bite and keeps going.
function clashes(g, events) {
  const crates = g.crates.slice();
  const badgers = g.badgers.slice();
  let boss = g.boss;
  let kills = g.kills;
  const pups = [];
  for (const p of g.pups) {
    let hp = p.hp;
    const pos = pupPosition(g, p);
    const r = unitRadius(p);
    const guard = Math.max(0, (p.guard ?? 0) - SUBSTEP);
    if (!p.dash && guard === 0) {
      for (let i = 0; i < badgers.length && hp > 0 && hp === p.hp; i++) {
        const b = badgers[i];
        if (b.hp <= 0 || Math.hypot(b.x - pos.x, b.y - pos.y) > BADGERS[b.kind].radius + r) continue;
        hp -= 1;
        badgers[i] = damage(b, p.tier, events, () => kills++);
      }
      // The King's charge costs a whole pup's worth from each dog he touches.
      if (boss && boss.hp > 0 && hp === p.hp && Math.hypot(boss.x - pos.x, boss.y - pos.y) < BOSS.radius + r) {
        hp -= BREEDS[p.breed].hp;
        boss = { ...boss, hp: boss.hp - p.tier, hit: 0.15 };
      }
    }
    if (hp <= 0) events.push({ type: 'yelp', x: pos.x, y: pos.y, breed: p.breed });
    else if (hp === p.hp) pups.push(guard === (p.guard ?? 0) ? p : { ...p, guard });
    else {
      // A big dog yelps for the pup it lost, then shakes it off.
      if (p.size > 1) events.push({ type: 'yelp', x: pos.x, y: pos.y, breed: p.breed });
      pups.push({ ...withHp(p, hp), guard: BITE_GUARD });
    }
  }
  return { ...g, pups, badgers: badgers.filter(b => b.hp > 0), crates, boss, kills };
}

// A crate broken open (by shots or zoomies) frees the pups inside.
function openCrates(g, events) {
  let next = g;
  g.crates.forEach((c, i) => {
    if (c.broken || c.hp > 0) return;
    const before = packSize(next);
    next = applyGate(next, c.reward);
    next = { ...next, crates: next.crates.map((k, j) => (j === i ? { ...k, hp: 0, broken: true } : k)) };
    events.push({ type: 'crate', side: c.side, op: c.reward, before, after: packSize(next), x: c.x, y: c.y });
  });
  return next;
}

export const progress = game => (game.phase === 'won' ? 1 : Math.min(1, game.pack.y / game.level.boss.d));
export const finalScore = game => game.kills * 10 + packSize(game) * 50;
