import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, applyGate, gateLabel, gateIsGood, formation, packRadius, pupPosition, mulberry32,
  progress, finalScore, BREEDS, BADGERS, BOSS, MAX_PUPS, LANE_HALF, RUN_SPEED,
} from '../game.js';
import { LEVEL } from '../level.js';

// A quiet test lane: no gates or waves unless a test adds them, boss far away.
const lane = (over = {}) => ({ length: 1000, gates: [], waves: [], boss: { d: 10000 }, ...over });
const game = (over = {}, level = lane()) => ({ ...createGame({ level, seed: 3 }), ...over });
const pups = (breed, n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, breed, ox: 0, oy: 0, hp: BREEDS[breed].hp, cooldown: 0, dash: null }));
const badger = (kind, x, y, id = 1) => ({ id, kind, x, y, hp: BADGERS[kind].hp, maxHp: BADGERS[kind].hp, hit: 0 });
const run = (g, seconds, input) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const r = step(g, 1 / 60, input);
    g = r.state;
    events.push(...r.events);
  }
  return { g, events };
};

test('a run starts with one smooth pup in the middle of the lane', () => {
  const g = createGame();
  assert.equal(g.pups.length, 1);
  assert.equal(g.pups[0].breed, 'smooth');
  assert.deepEqual(g.pack, { x: 0, y: 0 });
  assert.equal(g.phase, 'running');
});

test('seeded runs replay exactly', () => {
  const a = run(createGame({ seed: 5 }), 20, { steerX: -2 }).g;
  const b = run(createGame({ seed: 5 }), 20, { steerX: -2 }).g;
  assert.deepEqual(a, b);
  assert.notDeepEqual(mulberry32(1)(), mulberry32(2)());
});

test('the pack runs forward and slides toward where you steer, staying in the lane', () => {
  let { g } = run(game(), 1, { steerX: 3 });
  assert.ok(Math.abs(g.pack.y - RUN_SPEED) < 0.1);
  assert.ok(Math.abs(g.pack.x - 3) < 1e-9);
  ({ g } = run(game({ pups: pups('smooth', 60) }), 2, { steerX: 99 }));
  const edge = Math.max(...g.pups.map(p => pupPosition(g, p).x));
  assert.ok(edge < LANE_HALF, `pups at ${edge}`);
});

test('formation packs pups into a tidy blob, front slots first', () => {
  const slots = formation(30);
  assert.equal(slots.length, 30);
  for (let i = 1; i < slots.length; i++) assert.ok(slots[i - 1].y >= slots[i].y);
  for (const a of slots) for (const b of slots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.3);
  assert.ok(slots.every(s => Math.hypot(s.x, s.y) <= packRadius(30)));
});

test('long-haired pups take the front of the pack', () => {
  const mixed = [...pups('smooth', 10), ...pups('long', 3).map((p, i) => ({ ...p, id: 100 + i }))];
  const { g } = run(game({ pups: mixed }), 2);
  const longY = Math.min(...g.pups.filter(p => p.breed === 'long').map(p => p.oy));
  const othersY = Math.max(...g.pups.filter(p => p.breed !== 'long').map(p => p.oy));
  assert.ok(longY > othersY - 1e-9, `long ${longY} vs ${othersY}`);
});

test('gates add, multiply, subtract and divide, and never exceed the cap', () => {
  const g = game({ pups: [...pups('smooth', 3), ...pups('wire', 1).map(p => ({ ...p, id: 9 }))], nextId: 10 });
  assert.equal(applyGate(g, { add: 4 }).pups.length, 8);
  const wired = applyGate(g, { add: 2, breed: 'wire' });
  assert.equal(wired.pups.filter(p => p.breed === 'wire').length, 3);
  const doubled = applyGate(g, { mul: 2 });
  assert.equal(doubled.pups.length, 8);
  assert.equal(doubled.pups.filter(p => p.breed === 'wire').length, 2);
  assert.equal(applyGate(g, { sub: 3 }).pups.length, 1);
  assert.equal(applyGate(g, { sub: 30 }).pups.length, 0);
  assert.equal(applyGate(g, { div: 3 }).pups.length, 2);
  assert.equal(applyGate(game({ pups: pups('smooth', 100) }), { mul: 3 }).pups.length, MAX_PUPS);
  const ids = applyGate(g, { mul: 3 }).pups.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('gate labels and colours', () => {
  assert.equal(gateLabel({ add: 3 }), '+3');
  assert.equal(gateLabel({ add: 2, breed: 'wire' }), '+2 Wire-haired');
  assert.equal(gateLabel({ mul: 2 }), '×2');
  assert.equal(gateLabel({ sub: 5 }), '−5');
  assert.equal(gateLabel({ div: 2 }), '÷2');
  assert.ok(gateIsGood({ mul: 2 }) && !gateIsGood({ div: 2 }));
});

test('steering decides which gate you go through', () => {
  const level = lane({ gates: [{ d: 3, left: { add: 5 }, right: { sub: 1 } }] });
  const left = run(game({}, level), 1, { steerX: -2 });
  assert.equal(left.g.pups.length, 6);
  assert.equal(left.events.find(e => e.type === 'gate').side, 'left');
  const right = run(game({}, level), 1, { steerX: 2 });
  assert.equal(right.g.phase, 'lost');
});

test('waves spawn ahead of the pack and charge at it', () => {
  const level = lane({ waves: [{ d: 20, kind: 'badger', count: 8, spread: 3 }] });
  // They appear once the pack is 16 m short of them.
  const arrive = (20 - 16) / RUN_SPEED;
  let { g } = run(game({}, level), arrive - 0.1);
  assert.equal(g.badgers.length, 0);
  ({ g } = run(g, 0.15));
  assert.equal(g.badgers.length, 8);
  assert.ok(g.badgers.every(b => b.y >= 19 && b.y <= 23 && Math.abs(b.x) <= LANE_HALF));
  const before = g.badgers[0].y;
  ({ g } = run({ ...g, pups: [] }, 0.5));
  assert.ok(g.phase === 'lost' || g.badgers[0].y < before);
});

test('a smooth pup barks a badger down before it arrives', () => {
  const g = game({ badgers: [badger('badger', 0, 6)] });
  const { g: after, events } = run(g, 2);
  assert.equal(after.badgers.length, 0);
  assert.equal(after.kills, 1);
  assert.equal(after.pups.length, 1);
  assert.ok(events.some(e => e.type === 'bop'));
});

test('wire-haired pups fire a fan of bristles', () => {
  const g = game({ pups: pups('wire', 1), badgers: [badger('armored', 0, 4.5)] });
  const after = step(g, 1 / 60).state;
  assert.equal(after.shots.filter(s => s.kind === 'bristle').length, 3);
});

test('a badger that reaches a pup bites; long-haired pups take three bites', () => {
  const close = (kind, breed) => game({ pups: pups(breed, 1).map(p => ({ ...p, cooldown: 99 })), badgers: [badger(kind, 0, 0.5)] });
  const bitten = run(close('armored', 'smooth'), 0.3);
  assert.equal(bitten.g.phase, 'lost');
  assert.ok(bitten.events.some(e => e.type === 'yelp'));
  const shielded = run(close('badger', 'long'), 0.3);
  assert.equal(shielded.g.pups.length, 1);
  assert.equal(shielded.g.pups[0].hp, BREEDS.long.hp - 2);
  assert.equal(shielded.g.badgers.length, 0);
});

test('a dapple dashes into the badger, bowls it over and comes home', () => {
  const g = game({ pups: pups('dapple', 1), badgers: [badger('badger', 0, 5)] });
  let r = run(g, 0.1);
  assert.ok(r.g.pups[0].dash, 'dashing');
  r = run(r.g, 1.5);
  assert.equal(r.g.kills, 1);
  assert.equal(r.g.pups[0].dash, null);
  assert.ok(Math.hypot(r.g.pups[0].ox, r.g.pups[0].oy) < 0.5, 'back in the pack');
});

test('honey badgers are fast and armored ones are tough', () => {
  assert.ok(BADGERS.honey.speed > BADGERS.badger.speed);
  assert.ok(BADGERS.armored.hp >= BADGERS.badger.hp * 3);
});

test('the Badger King stops the pack, throws dirt, and falls to a big enough pack', () => {
  const level = lane({ boss: { d: 30 } });
  const approach = run(game({ pups: pups('smooth', 60) }, level), 6);
  const { g } = approach;
  assert.equal(g.phase, 'boss');
  const haltedAt = g.pack.y;
  assert.ok(run(g, 2).g.pack.y === haltedAt, 'halted to face him');
  const r = run(g, 120);
  assert.ok([...approach.events, ...r.events].some(e => e.type === 'splat'), 'threw dirt');
  assert.equal(r.g.phase, 'won');
  assert.ok(r.g.pups.length < 60, 'cost some pups');
  const small = run(game({ pups: pups('smooth', 3) }, level), 120);
  assert.equal(small.g.phase, 'lost');
});

test('the real level: good gate choices beat it, bad ones get wiped out', () => {
  const play = (pickGood, seed) => {
    let g = createGame({ seed });
    for (let t = 0; t < 240 && (g.phase === 'running' || g.phase === 'boss'); t += 1 / 30) {
      const gate = g.level.gates[g.gatesPassed];
      let steer = 0;
      if (gate && gate.d - g.pack.y < 25) {
        const gain = op => op.add ?? (op.mul ? g.pups.length * (op.mul - 1) : op.sub ? -op.sub : -g.pups.length / 2);
        steer = (gain(gate.left) >= gain(gate.right)) === pickGood ? -3 : 3;
      }
      g = step(g, 1 / 30, { steerX: steer }).state;
    }
    return g;
  };
  const wins = [1, 2, 3, 4].map(seed => play(true, seed)).filter(g => g.phase === 'won');
  assert.ok(wins.length >= 3, `won ${wins.length}/4`);
  assert.ok(wins.every(g => finalScore(g) > 0 && progress(g) === 1));
  assert.equal(play(false, 1).phase, 'lost');
  assert.equal(LEVEL.gates.length, 8);
});
