import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, applyGate, gateLabel, gateIsGood, formation, packRadius, pupPosition, mulberry32,
  progress, finalScore, packSize, mergePack, unitRadius, steerLimit, gatePreview, cratesFor, crateContact, splitAt, BREEDS, BADGERS, BOSS, MAX_PUPS, LANE_HALF, RUN_SPEED,
  DIVIDER_X, CRATE, SPAWN_AHEAD, MERGE_AT, MERGE_COUNT, TIERS,
} from '../game.js';
import { LEVEL } from '../level.js';

// A quiet test lane: no gates or waves unless a test adds them, boss far away.
const lane = (over = {}) => ({ length: 1000, gates: [], waves: [], boss: { d: 10000 }, ...over });
// Test pups get ids from 1; new ones made by the game start well clear of them.
const game = (over = {}, level = lane()) => ({ ...createGame({ level, seed: 3 }), nextId: 1000, ...over });
const pups = (breed, n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, breed, ox: 0, oy: 0, tier: 1, size: 1, hp: BREEDS[breed].hp, cooldown: 0, dash: null }));
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
  assert.equal(packSize(g), 1);
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

test('steering never sticks: holding into the side, then turning back, moves straight away', () => {
  const big = game({ pups: pups('smooth', 40) });
  let { g } = run(big, 2, { steerX: 99 });
  assert.ok(Math.abs(g.steer - steerLimit(g)) < 1e-9, 'target held at the reachable edge');
  const atEdge = g.pack.x;
  ({ g } = run(g, 0.1, { steerX: -99 }));
  assert.ok(g.pack.x < atEdge - 0.5, `moved back to ${g.pack.x}`);
});

test('gates preview the pack you would end up with', () => {
  const g = game({ pups: pups('smooth', 10) });
  assert.equal(gatePreview(g, { add: 5 }), 15);
  assert.equal(gatePreview(g, { mul: 2 }), 20);
  assert.equal(gatePreview(g, { sub: 3 }), 7);
  assert.equal(gatePreview(g, { div: 2 }), 5);
});

test('formation packs pups into a tidy blob', () => {
  const slots = formation(30);
  assert.equal(slots.length, 30);
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
  assert.equal(packSize(applyGate(g, { add: 4 })), 8);
  const wired = applyGate(g, { add: 2, breed: 'wire' });
  assert.equal(wired.pups.filter(p => p.breed === 'wire').length, 3);
  const doubled = applyGate(g, { mul: 2 });
  assert.equal(packSize(doubled), 8);
  assert.equal(doubled.pups.filter(p => p.breed === 'wire').length, 2);
  assert.equal(packSize(applyGate(g, { sub: 3 })), 1);
  assert.equal(packSize(applyGate(g, { sub: 30 })), 0);
  assert.equal(packSize(applyGate(g, { div: 3 })), 2);
  assert.equal(packSize(applyGate(game({ pups: pups('smooth', 100) }), { mul: 3 })), MAX_PUPS);
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
  assert.equal(packSize(left.g), 6);
  assert.equal(left.events.find(e => e.type === 'gate').side, 'left');
  const right = run(game({}, level), 1, { steerX: 2 });
  assert.equal(right.g.phase, 'lost');
});

test('waves appear far up the road and march straight at you', () => {
  const d = SPAWN_AHEAD + 10;
  const level = lane({ waves: [{ d, kind: 'badger', count: 8, spread: 3 }] });
  let { g } = run(game({}, level), (d - SPAWN_AHEAD) / RUN_SPEED - 0.1);
  assert.equal(g.badgers.length, 0);
  ({ g } = run(g, 0.15));
  assert.equal(g.badgers.length, 8);
  assert.ok(g.badgers.every(b => b.y >= d - 1 && b.y <= d + 3 && Math.abs(b.x) <= LANE_HALF));
  const spots = g.badgers.map(b => b.y);
  ({ g } = run(g, 0.5));
  assert.ok(g.badgers.every((b, i) => b.y < spots[i]), 'marching');
});

test('pups can hit badgers a long way off', () => {
  assert.ok(BREEDS.smooth.range >= 12);
  const g = game({ badgers: [badger('badger', 0, 11)] });
  const { g: after } = run(g, 0.9);
  assert.equal(after.kills, 1);
});

test('a smooth pup barks a badger down before it arrives', () => {
  const g = game({ badgers: [badger('badger', 0, 6)] });
  const { g: after, events } = run(g, 2);
  assert.equal(after.badgers.length, 0);
  assert.equal(after.kills, 1);
  assert.equal(packSize(after), 1);
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
  // The same bite that finishes a smooth just dents a long-hair.
  const shielded = run(close('badger', 'long'), 0.8);
  assert.equal(packSize(shielded.g), 1);
  assert.ok(shielded.g.pups[0].hp < BREEDS.long.hp);
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

test('enough pups of a breed merge into a Big dog, and Big dogs into a Mega-long one', () => {
  const g = applyGate(game({ pups: [] , nextId: 1 }), { add: MERGE_AT });
  assert.equal(packSize(g), MERGE_AT);
  assert.equal(g.pups.filter(p => p.tier === 2).length, 1);
  assert.equal(g.pups.filter(p => p.tier === 1).length, MERGE_AT - MERGE_COUNT);
  const big = g.pups.find(p => p.tier === 2);
  assert.equal(big.size, MERGE_COUNT);
  assert.ok(unitRadius(big) > unitRadius(g.pups.find(p => p.tier === 1)));
  const huge = applyGate(game({ pups: [], nextId: 1 }), { add: 200 });
  assert.equal(packSize(huge), 200);
  assert.ok(huge.pups.some(p => p.tier === 3), 'a Mega-long dog');
  assert.ok(huge.pups.length < 20, `only ${huge.pups.length} dogs on the road`);
  // Breeds don't mix.
  const mixed = applyGate(applyGate(game({ pups: [], nextId: 1 }), { add: 5, breed: 'wire' }), { add: 5 });
  assert.ok(mixed.pups.every(p => p.tier === 1));
});

test('a big pack stays narrow enough to steer', () => {
  const g = applyGate(game({ pups: [], nextId: 1 }), { add: 250 });
  const r = run(g, 1.5, { steerX: -LANE_HALF });
  assert.ok(r.g.pack.x < -2, `pack only reached ${r.g.pack.x}`);
});

test('a merged dog hits as hard as its pups and loses one pup per bite', () => {
  const g = applyGate(game({ pups: [], nextId: 1 }), { add: 5 + MERGE_AT - MERGE_COUNT });
  const big = g.pups.find(p => p.tier === 2);
  const after = step({ ...g, pups: [{ ...big, ox: 0, oy: 0 }], badgers: [badger('armored', 0, 6)] }, 1 / 60).state;
  assert.equal(after.shots[0].damage, BREEDS.smooth.damage * MERGE_COUNT);
  const bitten = run({ ...g, pups: [{ ...big, ox: 0, oy: 0, cooldown: 1e9 }], badgers: [badger('badger', 0, 0.4)] }, 0.05);
  assert.equal(packSize(bitten.g), MERGE_COUNT - 1);
  assert.equal(bitten.g.pups[0].tier, 2);
  // Gates take pups from the small dogs first, then whittle down the big ones.
  assert.equal(packSize(applyGate(g, { sub: 4 })), packSize(g) - 4);
  assert.equal(packSize(applyGate(g, { div: 2 })), Math.ceil(packSize(g) / 2));
  assert.equal(packSize(applyGate(g, { mul: 2 })), packSize(g) * 2);
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
  assert.ok(packSize(r.g) < 60, 'cost some pups');
  const small = run(game({ pups: pups('smooth', 3) }, level), 120);
  assert.equal(small.g.phase, 'lost');
});

const split = { d: 10, length: 20, left: { hp: 6, reward: { add: 4 } }, right: { hp: 60, reward: { mul: 2 } } };

test('a split puts a crate in the left lane and a tougher cage in the right', () => {
  const [crate, cage] = cratesFor(lane({ splits: [split] }));
  assert.ok(crate.x < -DIVIDER_X && cage.x > DIVIDER_X);
  assert.ok(!crate.cage && cage.cage);
  assert.ok(cage.hp > crate.hp);
  assert.equal(crate.y, split.d + split.length - CRATE.depth);
  assert.equal(splitAt(lane({ splits: [split] }), 15), split);
  assert.equal(splitAt(lane({ splits: [split] }), 35), null);
  assert.equal(crateContact(crate, { x: crate.x, y: crate.y }).d, 0);
});

test('shoot a crate open from its lane and the pups inside join you', () => {
  const level = lane({ splits: [split] });
  const r = run(game({ pups: pups('smooth', 4) }, level), 8, { steerX: -3.3 });
  const opened = r.events.find(e => e.type === 'crate');
  assert.equal(opened.side, 'left');
  assert.equal(packSize(r.g), 8);
  assert.ok(r.g.crates[0].broken && !r.g.crates[1].broken, 'only shot the crate in its own lane');
});

test('pups squeeze past a crate they did not open, without getting hurt', () => {
  const level = lane({ splits: [{ ...split, left: { hp: 999, reward: { add: 4 } } }] });
  const r = run(game({ pups: pups('smooth', 4) }, level), 8, { steerX: -3.3 });
  assert.equal(packSize(r.g), 4);
  assert.ok(!r.g.crates[0].broken);
  assert.ok(r.g.pack.y > split.d + split.length);
});

test('the horde keeps to the middle lane inside a split', () => {
  const level = lane({ splits: [split], waves: [{ d: 14, kind: 'honey', count: 10, spread: 10 }] });
  let { g } = run(game({ pups: pups('long', 3).map(p => ({ ...p, cooldown: 1e9 })) }, level), 0.1);
  assert.ok(g.badgers.every(b => Math.abs(b.x) < DIVIDER_X));
  // Hide in the left lane: they press against the fence but can't get through.
  for (let i = 0; i < 180; i++) {
    g = step(g, 1 / 60, { steerX: -3.3 }).state;
    for (const b of g.badgers) if (splitAt(level, b.y)) assert.ok(Math.abs(b.x) < DIVIDER_X, `badger at ${b.x}`);
  }
});

test('the real level: good gate choices win big, bad ones barely scrape through', () => {
  const play = (pickGood, seed) => {
    let g = createGame({ seed });
    for (let t = 0; t < 240 && (g.phase === 'running' || g.phase === 'boss'); t += 1 / 30) {
      const gate = g.level.gates[g.gatesPassed];
      let steer = 0;
      if (gate && gate.d - g.pack.y < 25) {
        const gain = op => op.add ?? (op.mul ? packSize(g) * (op.mul - 1) : op.sub ? -op.sub : -packSize(g) / 2);
        steer = (gain(gate.left) >= gain(gate.right)) === pickGood ? -3 : 3;
      }
      g = step(g, 1 / 30, { steerX: steer }).state;
    }
    return g;
  };
  const wins = [1, 2, 3, 4].map(seed => play(true, seed)).filter(g => g.phase === 'won');
  assert.ok(wins.length >= 3, `won ${wins.length}/4`);
  assert.ok(wins.every(g => finalScore(g) > 0 && progress(g) === 1));
  const bad = play(false, 1);
  assert.ok(bad.phase === 'lost' || packSize(bad) < packSize(wins[0]) / 3, `bad run kept ${packSize(bad)}`);
  assert.ok(LEVEL.gates.length >= 5 && LEVEL.splits.length >= 3);
});
