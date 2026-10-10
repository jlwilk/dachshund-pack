// The first run: about a minute of lane, then the Badger King.
// Distances are metres along the lane from the start.
//
// Gates come in pairs, left and right; you pick one by steering through it.
// Ops: { add: n, breed? } adds pups (smooth unless a breed is named),
// { mul: k } multiplies every breed, { sub: n } loses pups, { div: k } divides.
//
// Waves spawn just out of sight ahead: `count` badgers of `kind`, spread
// over `spread` metres of lane.

export const LEVEL = {
  length: 380,
  gates: [
    { d: 15, left: { add: 5 }, right: { mul: 2 } },
    { d: 50, left: { add: 3, breed: 'wire' }, right: { add: 8 } },
    { d: 95, left: { mul: 2 }, right: { sub: 5 } },
    { d: 140, left: { add: 5, breed: 'long' }, right: { add: 5, breed: 'dapple' } },
    { d: 185, left: { div: 2 }, right: { mul: 3 } },
    { d: 230, left: { add: 8, breed: 'wire' }, right: { add: 12 } },
    { d: 275, left: { mul: 2 }, right: { add: 6, breed: 'long' } },
    { d: 320, left: { sub: 10 }, right: { add: 8, breed: 'dapple' } },
  ],
  waves: [
    { d: 32, kind: 'badger', count: 6, spread: 4 },
    { d: 72, kind: 'badger', count: 14, spread: 6 },
    { d: 115, kind: 'honey', count: 10, spread: 5 },
    { d: 160, kind: 'badger', count: 24, spread: 8 },
    { d: 165, kind: 'armored', count: 4, spread: 2 },
    { d: 205, kind: 'honey', count: 24, spread: 8 },
    { d: 250, kind: 'armored', count: 10, spread: 6 },
    { d: 255, kind: 'badger', count: 40, spread: 10 },
    { d: 295, kind: 'honey', count: 36, spread: 8 },
    { d: 340, kind: 'badger', count: 50, spread: 10 },
    { d: 345, kind: 'armored', count: 14, spread: 8 },
    { d: 350, kind: 'honey', count: 30, spread: 6 },
  ],
  boss: { d: 395 },
};
