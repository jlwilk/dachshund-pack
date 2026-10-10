// The first run: about a minute and a half of lane, then the Badger King.
// Distances are metres along the lane from the start.
//
// Gates come in pairs, left and right; you pick one by steering through it.
// Ops: { add: n, breed? } adds pups (smooth unless a breed is named),
// { mul: k } multiplies every breed, { sub: n } loses pups, { div: k } divides.
//
// Splits fence the lane into three for `length` metres. The left lane ends in
// a crate and the right in a cage: shoot one open (it takes `hp` damage) for
// its reward. The middle is where the horde comes; put those waves inside
// the split so they keep to the middle lane.
//
// Waves spawn up the lane and wait for you: `count` badgers of `kind`,
// spread over `spread` metres.

export const LEVEL = {
  length: 380,
  gates: [
    { d: 15, left: { add: 5 }, right: { add: 3 } },
    { d: 45, left: { add: 4, breed: 'wire' }, right: { add: 8 } },
    { d: 120, left: { mul: 2 }, right: { add: 5 } },
    { d: 200, left: { div: 2 }, right: { add: 10 } },
    { d: 280, left: { add: 8 }, right: { add: 6, breed: 'long' } },
    { d: 350, left: { sub: 10 }, right: { add: 8, breed: 'dapple' } },
  ],
  splits: [
    { d: 62, length: 34, left: { hp: 12, reward: { add: 6 } }, right: { hp: 40, reward: { mul: 2 } } },
    { d: 140, length: 36, left: { hp: 25, reward: { add: 5, breed: 'long' } }, right: { hp: 80, reward: { add: 10, breed: 'wire' } } },
    { d: 220, length: 38, left: { hp: 40, reward: { add: 10 } }, right: { hp: 140, reward: { add: 20 } } },
    { d: 300, length: 36, left: { hp: 50, reward: { add: 6, breed: 'dapple' } }, right: { hp: 200, reward: { add: 25 } } },
  ],
  waves: [
    { d: 32, kind: 'badger', count: 7, spread: 4 },
    { d: 72, kind: 'badger', count: 11, spread: 12 }, // split 1, middle lane
    { d: 105, kind: 'honey', count: 12, spread: 5 },
    { d: 150, kind: 'badger', count: 20, spread: 14 }, // split 2
    { d: 158, kind: 'armored', count: 5, spread: 6 },
    { d: 185, kind: 'badger', count: 34, spread: 8 },
    { d: 230, kind: 'honey', count: 27, spread: 14 }, // split 3
    { d: 265, kind: 'honey', count: 40, spread: 8 },
    { d: 310, kind: 'badger', count: 43, spread: 14 }, // split 4
    { d: 318, kind: 'armored', count: 12, spread: 8 },
    { d: 340, kind: 'badger', count: 58, spread: 6 },
    { d: 355, kind: 'honey', count: 33, spread: 6 },
    { d: 362, kind: 'armored', count: 20, spread: 6 },
  ],
  boss: { d: 395 },
};
