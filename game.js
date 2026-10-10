// Dachshund Pack: a runner. Your pack of wiener dogs charges up a lane, you
// steer left and right through gates that grow (or shrink) the pack, and
// every pup fights the badgers in its own way. A Badger King waits at the end.
// Everything here is pure. World units are metres: x across the lane
// (0 is the middle), y along it (forward is +y). Times are in seconds.

import { LEVEL } from './level.js';

export const LANE_HALF = 5;
export const RUN_SPEED = 4;
export const STEER_SPEED = 9; // how fast the pack slides sideways toward where you're steering
export const MAX_PUPS = 120;
export const PUP_RADIUS = 0.3;
const SLOT_SPACING = 0.52;
const FORMATION_EASE = 8;
const SUBSTEP = 1 / 120;

// What each kind of pup does. Ranges in metres, cooldowns in seconds.
export const BREEDS = {
  // Barks: a quick single shot. The basic unit.
  smooth: { label: 'Smooth', hp: 1, attack: 'bark', range: 7, cooldown: 0.4, damage: 1 },
  // Bristle spray: three short darts in a fan, good against crowds.
  wire: { label: 'Wire-haired', hp: 1, attack: 'bristles', range: 5, cooldown: 0.9, damage: 0.7 },
  // Floof shield: takes three bites, runs at the front, and barks a little.
  long: { label: 'Long-haired', hp: 3, attack: 'bark', range: 5, cooldown: 1.0, damage: 0.5 },
  // Zoomies: dashes into the nearest badger, bowling it over, then runs back.
  dapple: { label: 'Dapple', hp: 1, attack: 'dash', range: 6, cooldown: 2.5, damage: 3 },
};

export const BADGERS = {
  badger: { hp: 2, speed: 1.6, radius: 0.4 },
  honey: { hp: 2, speed: 3.2, radius: 0.35 }, // honey badger don't care
  armored: { hp: 6, speed: 1.2, radius: 0.5 }, // bucket helmet
};

export const BOSS = { hp: 220, radius: 1.6, speed: 0.6, throwEvery: 2.2, clodSpeed: 7, stopShort: 9 };

const PROJECTILES = {
  bark: { speed: 14, radius: 0.2, life: 0.7 },
  bristle: { speed: 12, radius: 0.12, life: 0.45 },
  clod: { speed: BOSS.clodSpeed, radius: 0.3, life: 2.5 },
};
const DASH_SPEED = 16;
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

const newPup = (id, breed, ox = 0, oy = 0) => ({ id, breed, ox, oy, hp: BREEDS[breed].hp, cooldown: 0, dash: null });

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
    shots: [],
    boss: null,
    kills: 0,
    phase: 'running', // running → boss → won | lost
  };
}

// Sunflower formation: slot i sits at a golden-angle spiral, so any number
// of pups packs into a tidy blob. Long-haired pups take the front slots.
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export function formation(n) {
  const slots = [];
  for (let i = 0; i < n; i++) {
    const r = SLOT_SPACING * Math.sqrt(i + (i ? 0.5 : 0));
    slots.push({ x: Math.cos(i * GOLDEN) * r, y: Math.sin(i * GOLDEN) * r });
  }
  return slots.sort((a, b) => b.y - a.y);
}

export const packRadius = n => SLOT_SPACING * Math.sqrt(Math.max(1, n));

const FRONT_ORDER = { long: 0, smooth: 1, wire: 1, dapple: 2 };
function assignSlots(pups) {
  const slots = formation(pups.length);
  const order = pups.map((p, i) => i).sort((a, b) => FRONT_ORDER[pups[a].breed] - FRONT_ORDER[pups[b].breed] || pups[a].id - pups[b].id);
  const target = new Array(pups.length);
  order.forEach((pupIndex, slot) => {
    target[pupIndex] = slots[slot];
  });
  return target;
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

export function applyGate(game, op) {
  let { pups, nextId } = game;
  // New pups join from just behind the middle and run to their slots.
  const spawn = breed => newPup(nextId, breed, (((nextId++ * 0.618) % 1) - 0.5) * 0.4, -0.3);
  if (op.add) {
    const room = Math.max(0, MAX_PUPS - pups.length);
    pups = [...pups, ...Array.from({ length: Math.min(op.add, room) }, () => spawn(op.breed ?? 'smooth'))];
  } else if (op.mul) {
    const extra = [];
    for (let k = 1; k < op.mul; k++) for (const p of pups) extra.push(p.breed);
    pups = [...pups, ...extra.slice(0, Math.max(0, MAX_PUPS - pups.length)).map(spawn)];
  } else if (op.sub) {
    pups = pups.slice(0, Math.max(0, pups.length - op.sub));
  } else if (op.div) {
    pups = pups.slice(0, Math.ceil(pups.length / op.div));
  }
  return { ...game, pups, nextId };
}

// --- Stepping ------------------------------------------------------------

export function step(game, dt, { steerX = game.steer } = {}) {
  if (game.phase === 'won' || game.phase === 'lost') return { state: game, events: [] };
  let g = { ...game, steer: Math.max(-LANE_HALF, Math.min(LANE_HALF, steerX)) };
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

function movePack(g, dt) {
  const n = g.pups.length;
  // Keep the whole blob inside the lane.
  const edge = Math.max(0, LANE_HALF - packRadius(n) - PUP_RADIUS);
  const want = Math.max(-edge, Math.min(edge, g.steer));
  const dx = Math.max(-STEER_SPEED * dt, Math.min(STEER_SPEED * dt, want - g.pack.x));
  // The pack halts in front of the Badger King to fight him.
  const halt = g.boss && g.pack.y >= g.boss.y - BOSS.stopShort;
  const pack = { x: g.pack.x + dx, y: g.pack.y + (halt ? 0 : RUN_SPEED * dt) };

  const slots = assignSlots(g.pups);
  const ease = Math.min(1, FORMATION_EASE * dt);
  const pups = g.pups.map((p, i) => {
    if (p.dash) return p;
    return { ...p, ox: p.ox + (slots[i].x - p.ox) * ease, oy: p.oy + (slots[i].y - p.oy) * ease };
  });
  let boss = g.boss;
  if (!boss && pack.y >= g.level.boss.d - 16) {
    boss = { x: 0, y: g.level.boss.d, hp: BOSS.hp, maxHp: BOSS.hp, throwIn: 2 };
  }
  return { ...g, pack, pups, boss, phase: boss ? 'boss' : g.phase };
}

function passGates(g, events) {
  const gate = g.level.gates[g.gatesPassed];
  if (!gate || g.pack.y < gate.d) return g;
  const side = g.pack.x < 0 ? 'left' : 'right';
  const op = gate[side];
  const before = g.pups.length;
  const next = applyGate({ ...g, gatesPassed: g.gatesPassed + 1 }, op);
  events.push({ type: 'gate', side, op, before, after: next.pups.length });
  return next;
}

function spawnWaves(g, rng) {
  let { wavesSpawned, badgers, nextBadger } = g;
  const waves = g.level.waves;
  while (wavesSpawned < waves.length && g.pack.y >= waves[wavesSpawned].d - 16) {
    const w = waves[wavesSpawned++];
    const kind = BADGERS[w.kind];
    const fresh = Array.from({ length: w.count }, () => ({
      id: nextBadger++,
      kind: w.kind,
      x: (rng() * 2 - 1) * (LANE_HALF - kind.radius),
      y: w.d + rng() * w.spread,
      hp: kind.hp,
      maxHp: kind.hp,
      hit: 0,
    }));
    badgers = [...badgers, ...fresh];
  }
  return { ...g, wavesSpawned, badgers, nextBadger };
}

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
      return {
        ...b,
        x: Math.max(-LANE_HALF, Math.min(LANE_HALF, b.x + vx * dt)),
        y: b.y + vy * dt,
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
  return { ...g, badgers, boss };
}

// Every target a pup can attack: badgers plus the King.
function targets(g) {
  const list = g.badgers.map((b, i) => ({ x: b.x, y: b.y, r: BADGERS[b.kind].radius, ref: i }));
  if (g.boss && g.boss.hp > 0) list.push({ x: g.boss.x, y: g.boss.y, r: BOSS.radius, ref: 'boss' });
  return list;
}

function fight(g, dt, events) {
  const foes = targets(g);
  const shots = [...g.shots];
  let boss = g.boss;
  const badgers = g.badgers.slice();
  let kills = g.kills;

  const pups = g.pups.map(p => {
    const breed = BREEDS[p.breed];
    const pos = pupPosition(g, p);
    if (p.dash) return dashStep(g, p, pos, dt, badgers, events, b => (boss = b), () => kills++);
    const cooldown = Math.max(0, p.cooldown - dt);
    if (cooldown > 0) return { ...p, cooldown };
    let best = null;
    let bestD = breed.range;
    for (const f of foes) {
      const d = Math.hypot(f.x - pos.x, f.y - pos.y) - f.r;
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    if (!best) return { ...p, cooldown: 0 };
    const angle = Math.atan2(best.y - pos.y, best.x - pos.x);
    if (breed.attack === 'bark') {
      shots.push(shot('bark', pos, angle, breed.damage));
    } else if (breed.attack === 'bristles') {
      for (const spread of [-0.26, 0, 0.26]) shots.push(shot('bristle', pos, angle + spread, breed.damage));
    } else {
      return { ...p, cooldown: breed.cooldown, dash: { tx: best.x, ty: best.y, back: false, hit: [] } };
    }
    return { ...p, cooldown: breed.cooldown };
  });
  return { ...g, pups, shots, badgers, boss, kills };
}

const shot = (kind, from, angle, damage) => {
  const k = PROJECTILES[kind];
  return { kind, x: from.x, y: from.y, vx: Math.cos(angle) * k.speed, vy: Math.sin(angle) * k.speed, damage, life: k.life, foe: false };
};

// A dapple's zoomies: out to the target, bowling over anything on the way, then home.
function dashStep(g, p, pos, dt, badgers, events, setBoss, countKill) {
  const d = p.dash;
  const goal = d.back ? { x: g.pack.x, y: g.pack.y } : { x: d.tx, y: d.ty };
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = DASH_SPEED * dt;
  const moved = dist <= stepLen ? goal : { x: pos.x + (dx / dist) * stepLen, y: pos.y + (dy / dist) * stepLen };
  const hit = d.hit.slice();
  for (let i = 0; i < badgers.length; i++) {
    const b = badgers[i];
    if (b.hp <= 0 || hit.includes(b.id)) continue;
    if (Math.hypot(b.x - moved.x, b.y - moved.y) < BADGERS[b.kind].radius + PUP_RADIUS) {
      hit.push(b.id);
      badgers[i] = damage(b, BREEDS.dapple.damage, events, countKill);
    }
  }
  if (g.boss && g.boss.hp > 0 && !hit.includes('boss') && Math.hypot(g.boss.x - moved.x, g.boss.y - moved.y) < BOSS.radius + PUP_RADIUS) {
    hit.push('boss');
    setBoss({ ...g.boss, hp: g.boss.hp - BREEDS.dapple.damage, hit: 0.15 });
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
        return !p.dash && Math.hypot(pos.x - next.x, pos.y - next.y) < r + PUP_RADIUS;
      });
      if (victim >= 0) {
        pups = pups.map((p, i) => (i === victim ? { ...p, hp: p.hp - 1 } : p)).filter(p => p.hp > 0);
        events.push({ type: 'splat', x: next.x, y: next.y });
        continue;
      }
      shots.push(next);
      continue;
    }
    const i = badgers.findIndex(b => b.hp > 0 && Math.hypot(b.x - next.x, b.y - next.y) < r + BADGERS[b.kind].radius);
    if (i >= 0) {
      badgers[i] = damage(badgers[i], s.damage, events, () => kills++);
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
  return { ...g, badgers: badgers.filter(b => b.hp > 0), boss, pups, kills, shots };
}

// Badgers that reach the pack bite: each bite costs a pup a life and the
// badger a point of health. Long-haired pups can take three.
function clashes(g, events) {
  const badgers = g.badgers.slice();
  let boss = g.boss;
  let kills = g.kills;
  const pups = [];
  for (const p of g.pups) {
    let hp = p.hp;
    const pos = pupPosition(g, p);
    if (!p.dash) {
      for (let i = 0; i < badgers.length && hp > 0; i++) {
        const b = badgers[i];
        if (b.hp <= 0 || Math.hypot(b.x - pos.x, b.y - pos.y) > BADGERS[b.kind].radius + PUP_RADIUS) continue;
        hp -= 1;
        badgers[i] = damage(b, 1, events, () => kills++);
      }
      if (boss && boss.hp > 0 && hp > 0 && Math.hypot(boss.x - pos.x, boss.y - pos.y) < BOSS.radius + PUP_RADIUS) {
        hp = 0;
        boss = { ...boss, hp: boss.hp - 1, hit: 0.15 };
      }
    }
    if (hp > 0) pups.push(hp === p.hp ? p : { ...p, hp });
    else events.push({ type: 'yelp', x: pos.x, y: pos.y, breed: p.breed });
  }
  return { ...g, pups, badgers: badgers.filter(b => b.hp > 0), boss, kills };
}

export const progress = game => (game.phase === 'won' ? 1 : Math.min(1, game.pack.y / game.level.boss.d));
export const finalScore = game => game.kills * 10 + game.pups.length * 50;
