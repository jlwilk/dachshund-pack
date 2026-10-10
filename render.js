import { LANE_HALF, BOSS, BADGERS, BREEDS, gateLabel, gateIsGood, pupPosition, progress } from './game.js';

// The canvas is drawn at VIEW_W x VIEW_H (portrait, like a phone) and scaled to fit.
export const VIEW_W = 540;
export const VIEW_H = 960;
const SCALE = VIEW_W / (LANE_HALF * 2 + 1.4); // px per metre
const PACK_Y = VIEW_H * 0.74; // where the pack sits on screen
const AHEAD = PACK_Y / SCALE;
const BEHIND = (VIEW_H - PACK_Y) / SCALE;

const C = {
  grass: '#7cc35a',
  grassDark: '#6ab04b',
  path: '#d8b47c',
  pathEdge: '#b98f55',
  pebble: '#c3a06a',
  bush: '#4f9a3c',
  bushLight: '#62b14c',
  ink: '#1e1410',
  white: '#ffffff',
  good: 'rgba(59, 130, 246, 0.55)',
  goodEdge: '#1d4ed8',
  bad: 'rgba(225, 54, 54, 0.55)',
  badEdge: '#991b1b',
  badger: '#8b8f94',
  badgerDark: '#5b5f64',
  honey: '#1f1f22',
  honeyCape: '#d9d9d6',
  bucket: '#a9b2bb',
  bucketDark: '#6d767f',
  crown: '#f2c230',
  clod: '#7a5230',
};

const PUPS = {
  smooth: { body: '#a65a2a', outline: '#6b3417', ear: '#6e3416', light: '#c98a55' },
  wire: { body: '#7d6a55', outline: '#463a2d', ear: '#5a4a3a', light: '#a8957c' },
  long: { body: '#e3c18c', outline: '#a87e45', ear: '#cfa368', light: '#f2dcb4' },
  dapple: { body: '#4a2e1c', outline: '#26160c', ear: '#3a2414', light: '#d9c4a8' },
};

export const camera = game => game.pack.y;

const toScreen = (cam, x, y) => ({ x: VIEW_W / 2 + x * SCALE, y: PACK_Y - (y - cam) * SCALE });

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function draw(ctx, { game, time, fx }) {
  const cam = camera(game);
  drawGround(ctx, cam);
  drawGates(ctx, game, cam);
  for (const s of game.shots) drawShot(ctx, s, cam);
  for (const b of game.badgers) drawBadger(ctx, b, cam, time);
  if (game.boss) drawBoss(ctx, game.boss, cam, time);
  // Back of the pack first, so pups in front overlap the ones behind.
  const pups = game.pups.map(p => ({ p, pos: pupPosition(game, p) })).sort((a, b) => b.pos.y - a.pos.y);
  for (const { p, pos } of pups) drawPup(ctx, p, toScreen(cam, pos.x, pos.y), time);
  for (const f of fx) drawFx(ctx, f, cam, time);
  drawCount(ctx, game, cam);
  drawHud(ctx, game);
}

function drawGround(ctx, cam) {
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const left = toScreen(cam, -LANE_HALF, 0).x;
  const right = toScreen(cam, LANE_HALF, 0).x;
  // Grass stripes and tufts scroll with the world.
  const y0 = Math.floor(cam - BEHIND) - 1;
  const y1 = Math.ceil(cam + AHEAD) + 1;
  ctx.fillStyle = C.grassDark;
  for (let y = y0; y <= y1; y++) {
    if (((y % 4) + 4) % 4 < 2) continue;
    const s = toScreen(cam, 0, y + 1);
    ctx.fillRect(0, s.y, left, SCALE);
    ctx.fillRect(right, s.y, VIEW_W - right, SCALE);
  }
  ctx.fillStyle = C.pathEdge;
  ctx.fillRect(left - 6, 0, right - left + 12, VIEW_H);
  ctx.fillStyle = C.path;
  ctx.fillRect(left, 0, right - left, VIEW_H);
  ctx.fillStyle = C.pebble;
  for (let y = y0; y <= y1; y++) {
    for (let k = 0; k < 3; k++) {
      const h = hash(y * 7 + k);
      const p = toScreen(cam, (h * 2 - 1) * (LANE_HALF - 0.2), y + hash(y * 13 + k));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3 + h * 3, 2 + h * 2, h * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Bushes along both sides.
  for (let y = Math.floor(y0 / 3) * 3; y <= y1; y += 3) {
    for (const side of [-1, 1]) {
      const h = hash(y * 3 + side);
      if (h < 0.35) continue;
      const p = toScreen(cam, side * (LANE_HALF + 0.55 + h * 0.15), y);
      ctx.fillStyle = C.bush;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13 + h * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bushLight;
      ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 4, 7 + h * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGates(ctx, game, cam) {
  game.level.gates.forEach((gate, i) => {
    if (i < game.gatesPassed) return;
    const s = toScreen(cam, 0, gate.d);
    if (s.y < -60 || s.y > VIEW_H + 60) return;
    for (const [side, op] of [['left', gate.left], ['right', gate.right]]) {
      const x0 = toScreen(cam, side === 'left' ? -LANE_HALF : 0, 0).x;
      const w = LANE_HALF * SCALE;
      const good = gateIsGood(op);
      ctx.fillStyle = good ? C.good : C.bad;
      ctx.fillRect(x0 + 3, s.y - 26, w - 6, 52);
      ctx.strokeStyle = good ? C.goodEdge : C.badEdge;
      ctx.lineWidth = 4;
      ctx.strokeRect(x0 + 3, s.y - 26, w - 6, 52);
      ctx.fillStyle = C.white;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 4;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = gateLabel(op);
      const breed = op.breed;
      ctx.font = `800 ${breed ? 22 : 30}px system-ui, sans-serif`;
      const text = breed ? `+${op.add}` : label;
      const cx = x0 + w / 2 + (breed ? 18 : 0);
      ctx.strokeText(text, cx, s.y);
      ctx.fillText(text, cx, s.y);
      // A breed gate shows the pup you'll get.
      if (breed) drawPup(ctx, { breed, dash: null, id: i }, { x: x0 + w / 2 - 26, y: s.y + 6 }, 0, 0.9);
    }
    // Centre post between the two gates.
    ctx.fillStyle = C.ink;
    ctx.fillRect(s.x - 3, s.y - 30, 6, 60);
  });
}

function drawShot(ctx, s, cam) {
  const p = toScreen(cam, s.x, s.y);
  if (s.kind === 'bark') {
    // A little "woof" ring.
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.kind === 'bristle') {
    const a = Math.atan2(-s.vy, s.vx);
    ctx.strokeStyle = '#3a2d22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - Math.cos(a) * 7, p.y - Math.sin(a) * 7);
    ctx.lineTo(p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7);
    ctx.stroke();
  } else {
    ctx.fillStyle = C.clod;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.3 * SCALE, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// Badgers face down the screen, toward the pack.
function badgerShape(ctx, r, kind, time, seed) {
  const honey = kind === 'honey';
  const waddle = Math.sin(time / 90 + seed) * 0.12;
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.strokeStyle = C.ink;
  // Legs
  ctx.fillStyle = honey ? '#111' : C.badgerDark;
  for (const [lx, ly] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.5], [0.75, 0.5]]) {
    ctx.beginPath();
    ctx.ellipse(lx * r, (ly + (lx * ly > 0 ? waddle : -waddle)) * r, r * 0.25, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body
  ctx.fillStyle = honey ? C.honey : C.badger;
  ctx.beginPath();
  ctx.ellipse(0, -0.15 * r, r * 0.85, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (honey) {
    // The honey badger's silver cape.
    ctx.fillStyle = C.honeyCape;
    ctx.beginPath();
    ctx.ellipse(0, -0.25 * r, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head: white face with the two black stripes.
  ctx.fillStyle = honey ? C.honeyCape : C.white;
  ctx.beginPath();
  ctx.ellipse(0, 0.85 * r, r * 0.5, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!honey) {
    ctx.fillStyle = C.ink;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 0.22 * r, 0.8 * r, r * 0.11, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Nose and angry eyes.
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(0, 1.32 * r, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8463a';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 0.2 * r, 0.95 * r, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBadger(ctx, b, cam, time) {
  const p = toScreen(cam, b.x, b.y);
  if (p.y < -40 || p.y > VIEW_H + 40) return;
  const r = BADGERS[b.kind].radius * SCALE;
  ctx.save();
  ctx.translate(p.x, p.y);
  badgerShape(ctx, r, b.kind, time, b.id);
  if (b.kind === 'armored') {
    // Bucket helmet, dented.
    ctx.fillStyle = C.bucket;
    ctx.strokeStyle = C.bucketDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0.7 * r, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 0.95 * r);
    ctx.lineTo(r * 0.62, 0.95 * r);
    ctx.stroke();
  }
  if (b.hit > 0) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (b.maxHp > 2 && b.hp < b.maxHp) healthBar(ctx, p.x, p.y - r * 1.5, r * 2, b.hp / b.maxHp);
}

function healthBar(ctx, cx, y, w, frac) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(cx - w / 2, y, w, 6);
  ctx.fillStyle = '#e8463a';
  ctx.fillRect(cx - w / 2 + 1, y + 1, (w - 2) * Math.max(0, frac), 4);
}

function drawBoss(ctx, boss, cam, time) {
  const p = toScreen(cam, boss.x, boss.y);
  if (p.y < -120 || p.y > VIEW_H + 120) return;
  const r = BOSS.radius * SCALE;
  ctx.save();
  ctx.translate(p.x, p.y);
  badgerShape(ctx, r, 'badger', time * 0.6, 0);
  // His crown.
  ctx.fillStyle = C.crown;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, 0.35 * r);
  for (let i = 0; i <= 4; i++) {
    const x = -r * 0.45 + (i * r * 0.9) / 4;
    ctx.lineTo(x, (i % 2 ? 0.55 : 0.05) * r);
  }
  ctx.lineTo(r * 0.45, 0.55 * r);
  ctx.lineTo(-r * 0.45, 0.55 * r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if ((boss.hit ?? 0) > 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// A top-down sausage dog facing up the screen (or the way it's dashing).
export function drawPup(ctx, p, at, time, scale = 1) {
  const c = PUPS[p.breed];
  const L = 0.8 * SCALE * scale;
  const W = 0.3 * SCALE * scale;
  ctx.save();
  ctx.translate(at.x, at.y);
  if (p.dash) ctx.rotate(p.dash.back ? Math.PI : 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const scurry = Math.sin(time / 60 + p.id * 1.7) * W * 0.35;
  // Legs, scurrying.
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = W * 0.32;
  ctx.beginPath();
  for (const [ly, sgn] of [[-L * 0.25, 1], [L * 0.28, -1]]) {
    ctx.moveTo(-W * 0.45, ly + scurry * sgn);
    ctx.lineTo(-W * 0.85, ly + scurry * sgn - W * 0.1);
    ctx.moveTo(W * 0.45, ly - scurry * sgn);
    ctx.lineTo(W * 0.85, ly - scurry * sgn - W * 0.1);
  }
  ctx.stroke();
  // Tail
  ctx.beginPath();
  ctx.moveTo(0, L * 0.45);
  ctx.quadraticCurveTo(W * 0.4 + Math.sin(time / 90 + p.id) * W * 0.4, L * 0.6, 0, L * 0.72);
  ctx.lineWidth = W * 0.28;
  ctx.stroke();
  // Long-haired: a feathery fringe drawn under the body.
  if (p.breed === 'long') {
    ctx.strokeStyle = c.ear;
    ctx.lineWidth = W * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -L * 0.25);
    ctx.lineTo(0, L * 0.4);
    ctx.stroke();
  }
  // Body
  ctx.beginPath();
  ctx.moveTo(0, -L * 0.3);
  ctx.lineTo(0, L * 0.42);
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = W + 3;
  ctx.stroke();
  ctx.strokeStyle = c.body;
  ctx.lineWidth = W;
  ctx.stroke();
  ctx.strokeStyle = c.light;
  ctx.lineWidth = W * 0.3;
  ctx.stroke();
  if (p.breed === 'dapple') {
    ctx.fillStyle = c.light;
    for (const [dx, dy, r] of [[-0.2, -0.05, 0.16], [0.18, 0.18, 0.13], [-0.1, 0.32, 0.11]]) {
      ctx.beginPath();
      ctx.arc(dx * W, dy * L, r * W * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.breed === 'wire') {
    // Scruffy bristles along both sides.
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const y = -L * 0.2 + (k * L * 0.6) / 4;
      ctx.moveTo(-W * 0.5, y);
      ctx.lineTo(-W * 0.8, y - 2);
      ctx.moveTo(W * 0.5, y);
      ctx.lineTo(W * 0.8, y - 2);
    }
    ctx.stroke();
  }
  // Head with floppy ears and a nose.
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -L * 0.42, W * 0.62, W * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.ear;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * W * 0.62, -L * 0.36, W * 0.25, W * 0.48, sx * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(0, -L * 0.42 - W * 0.62, W * 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (p.breed === 'wire') {
    // Bushy brows.
    ctx.fillStyle = c.light;
    ctx.fillRect(-W * 0.4, -L * 0.48, W * 0.8, W * 0.16);
  }
  if (p.hp !== undefined && p.hp < BREEDS[p.breed].hp) {
    // A bandage on a bitten long-hair.
    ctx.fillStyle = C.white;
    ctx.fillRect(-W * 0.5, L * 0.05, W, W * 0.3);
  }
  ctx.restore();
}

function drawFx(ctx, f, cam, time) {
  const age = (time - f.born) / 1000;
  if (age > 0.8) return;
  const p = toScreen(cam, f.x, f.y);
  ctx.save();
  ctx.globalAlpha = 1 - age / 0.8;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (f.type === 'bop') {
    // Stars where a badger went down.
    ctx.fillStyle = '#ffe14d';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + age * 4;
      const d = 6 + age * 30;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.type === 'yelp') {
    ctx.fillStyle = C.white;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.strokeText('yip!', p.x, p.y - 12 - age * 30);
    ctx.fillText('yip!', p.x, p.y - 12 - age * 30);
  } else if (f.type === 'splat') {
    ctx.fillStyle = C.clod;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * age * 30, p.y + Math.sin(a) * age * 30, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.type === 'gate') {
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillStyle = f.good ? '#bfe0ff' : '#ffc4c4';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 5;
    ctx.strokeText(f.text, p.x, p.y - 60 - age * 50);
    ctx.fillText(f.text, p.x, p.y - 60 - age * 50);
  }
  ctx.restore();
}

// How many pups you've got, floating over the pack.
function drawCount(ctx, game, cam) {
  if (!game.pups.length) return;
  const top = Math.max(...game.pups.map(p => p.oy)) + 0.9;
  const p = toScreen(cam, game.pack.x, game.pack.y + top);
  const text = String(game.pups.length);
  ctx.font = '800 24px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = 'rgba(30, 20, 16, 0.75)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(p.x - w / 2, p.y - 18, w, 34, 17);
  else ctx.rect(p.x - w / 2, p.y - 18, w, 34);
  ctx.fill();
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y);
}

function drawHud(ctx, game) {
  // Progress up the lane, with the King waiting at the end.
  const x0 = 70;
  const x1 = VIEW_W - 70;
  ctx.fillStyle = 'rgba(30, 20, 16, 0.55)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, 16, x1 - x0, 12, 6);
  else ctx.rect(x0, 16, x1 - x0, 12);
  ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(x0 + 2, 18, (x1 - x0 - 4) * progress(game), 8);
  ctx.fillStyle = C.crown;
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('♛', x1 + 8, 22);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'right';
  ctx.fillText(`${game.kills}`, x0 - 10, 22);

  // Who's in the pack.
  const counts = Object.keys(PUPS).map(breed => [breed, game.pups.filter(p => p.breed === breed).length]).filter(([, n]) => n);
  let x = 16;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (const [breed, n] of counts) {
    drawPup(ctx, { breed, dash: null, id: 0 }, { x: x + 8, y: 56 }, 0, 0.7);
    ctx.fillStyle = C.white;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.strokeText(`${n}`, x + 20, 58);
    ctx.fillText(`${n}`, x + 20, 58);
    x += 58;
  }

  if (game.boss && game.boss.hp > 0 && game.boss.y - game.pack.y < 20) {
    const w = VIEW_W - 80;
    ctx.fillStyle = C.white;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.strokeText('THE BADGER KING', VIEW_W / 2, 92);
    ctx.fillText('THE BADGER KING', VIEW_W / 2, 92);
    healthBar(ctx, VIEW_W / 2, 104, w, game.boss.hp / game.boss.maxHp);
  }
}
