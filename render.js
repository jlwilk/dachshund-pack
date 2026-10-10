import {
  LANE_HALF, BOSS, BADGERS, BREEDS, DIVIDER_X, CRATE, TIERS, gateLabel, gateIsGood, gatePreview, pupPosition, progress, packSize,
} from './game.js';

// The canvas is drawn at VIEW_W x VIEW_H (portrait, like a phone) and scaled to fit.
export const VIEW_W = 540;
export const VIEW_H = 960;

// A chase camera behind and above the pack, tilted down to look up the lane.
const CAM_BACK = 4;
const CAM_HEIGHT = 7.5;
const PITCH = (42 * Math.PI) / 180;
const FOCAL = 420;
const CX = VIEW_W / 2;
const CY = 690; // puts the pack near the bottom of the screen
const COS = Math.cos(PITCH);
const SIN = Math.sin(PITCH);
const HORIZON = CY - FOCAL * Math.tan(PITCH);
const NEAR = 2.5; // how far behind the pack the bottom of the screen shows
const FAR = 90;
// The pack is always the same distance from the camera, so steering maps
// screen x to lane x with a fixed scale.
const PACK_DEPTH = CAM_BACK * COS + CAM_HEIGHT * SIN;
export const laneXFromScreen = px => ((px - CX) * PACK_DEPTH) / FOCAL;
export const metresPerScreenPx = PACK_DEPTH / FOCAL;

const SQUASH = 0.6; // how flat ground effects (stars, splats) look from the camera

const C = {
  skyTop: '#8fd3f4',
  skyBottom: '#e3f4fb',
  hills: '#9fd27c',
  grass: '#7cc35a',
  grassDark: '#6ab04b',
  path: '#d8b47c',
  pathDark: '#cfa970',
  pathEdge: '#b98f55',
  pebble: '#c3a06a',
  bush: '#4f9a3c',
  bushLight: '#62b14c',
  fence: '#8a5a32',
  fenceLight: '#a8713f',
  ink: '#1e1410',
  white: '#ffffff',
  good: 'rgba(59, 130, 246, 0.6)',
  goodEdge: '#1d4ed8',
  bad: 'rgba(225, 54, 54, 0.6)',
  badEdge: '#991b1b',
  badger: '#8b8f94',
  badgerDark: '#5b5f64',
  honey: '#1f1f22',
  honeyCape: '#d9d9d6',
  bucket: '#a9b2bb',
  bucketDark: '#6d767f',
  crown: '#f2c230',
  clod: '#7a5230',
  crate: '#c08447',
  crateDark: '#8a5a2c',
  crateTop: '#d39a5c',
  cage: '#8f9aa6',
  cageDark: '#56606b',
  cageTop: '#aab4be',
};

const PUPS = {
  smooth: { body: '#a65a2a', outline: '#6b3417', ear: '#6e3416', light: '#c98a55' },
  wire: { body: '#7d6a55', outline: '#463a2d', ear: '#5a4a3a', light: '#a8957c' },
  long: { body: '#e3c18c', outline: '#a87e45', ear: '#cfa368', light: '#f2dcb4' },
  dapple: { body: '#4a2e1c', outline: '#26160c', ear: '#3a2414', light: '#d9c4a8' },
};

export const camera = game => game.pack.y;

function project(cam, x, y, z = 0) {
  const f = y - (cam - CAM_BACK);
  const u = CAM_HEIGHT - z;
  const depth = f * COS + u * SIN;
  if (depth < 0.5) return null;
  const vert = u * COS - f * SIN;
  return { x: CX + (FOCAL * x) / depth, y: CY + (FOCAL * vert) / depth, s: FOCAL / depth };
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function quad(ctx, pts, fill, stroke, width = 2) {
  if (pts.some(p => !p)) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

// A flat strip of ground across x0..x1 between y0 and y1.
const strip = (ctx, cam, x0, x1, y0, y1, fill) =>
  quad(ctx, [project(cam, x0, y0), project(cam, x1, y0), project(cam, x1, y1), project(cam, x0, y1)], fill);

export function draw(ctx, { game, time, fx }) {
  const cam = camera(game);
  drawGround(ctx);
  drawFences(ctx, game, cam);

  // Far to near, so closer things cover farther ones.
  const things = [];
  game.level.gates.forEach((gate, i) => {
    if (i >= game.gatesPassed) things.push({ y: gate.d, draw: () => drawGate(ctx, gate, i, cam, game, time) });
  });
  for (const c of game.crates) if (!c.broken) things.push({ y: c.y - CRATE.depth / 2, draw: () => drawCrate(ctx, c, cam, time, game) });
  for (const b of game.badgers) things.push({ y: b.y, draw: () => drawBadger(ctx, b, cam, time) });
  if (game.boss) things.push({ y: game.boss.y, draw: () => drawBoss(ctx, game.boss, cam, time) });
  for (const p of game.pups) {
    const pos = pupPosition(game, p);
    things.push({ y: pos.y, draw: () => drawPupAt(ctx, p, pos, cam, time) });
  }
  for (const s of game.shots) things.push({ y: s.y, draw: () => drawShot(ctx, s, cam) });
  things.sort((a, b) => b.y - a.y).forEach(t => t.draw());

  for (const f of fx) drawFx(ctx, f, cam, time);
  drawCount(ctx, game);
  drawHud(ctx, game);
}

// The road itself stays put: the pack holds its ground and everything else
// (gates, crates, fences, badgers) comes down it toward you.
function drawGround(ctx) {
  const cam = 0;
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, C.skyTop);
  sky.addColorStop(1, C.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, HORIZON + 1);
  ctx.fillStyle = C.hills;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON + 1);
  for (let x = 0; x <= VIEW_W; x += 15) ctx.lineTo(x, HORIZON - 14 - Math.sin(x / 70) * 8 - Math.sin(x / 31) * 3);
  ctx.lineTo(VIEW_W, HORIZON + 1);
  ctx.fill();
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, HORIZON, VIEW_W, VIEW_H - HORIZON);

  const y0 = Math.floor(cam - NEAR);
  const y1 = cam + FAR;
  // Mown grass stripes either side, scrolling with the world.
  for (let y = Math.floor(y0 / 4) * 4; y < y1; y += 4) {
    strip(ctx, cam, -60, -LANE_HALF, y, y + 2, C.grassDark);
    strip(ctx, cam, LANE_HALF, 60, y, y + 2, C.grassDark);
  }
  strip(ctx, cam, -LANE_HALF - 0.25, LANE_HALF + 0.25, y0, y1, C.pathEdge);
  strip(ctx, cam, -LANE_HALF, LANE_HALF, y0, y1, C.path);
  for (let y = Math.floor(y0 / 6) * 6; y < y1; y += 6) strip(ctx, cam, -LANE_HALF, LANE_HALF, y, y + 3, C.pathDark);
  ctx.fillStyle = C.pebble;
  for (let y = y0; y < cam + 40; y++) {
    for (let k = 0; k < 3; k++) {
      const h = hash(y * 7 + k);
      const p = project(cam, (h * 2 - 1) * (LANE_HALF - 0.2), y + hash(y * 13 + k));
      if (!p) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (0.06 + h * 0.05) * p.s, (0.03 + h * 0.03) * p.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Bushes along both sides, far ones first.
  for (let y = Math.ceil(y1 / 3) * 3; y >= Math.floor(y0 / 3) * 3; y -= 3) {
    for (const side of [-1, 1]) {
      const h = hash(y * 3 + side);
      if (h < 0.35) continue;
      const p = project(cam, side * (LANE_HALF + 0.9 + h * 0.4), y, 0.45);
      if (!p) continue;
      ctx.fillStyle = C.bush;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (0.55 + h * 0.2) * p.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bushLight;
      ctx.beginPath();
      ctx.arc(p.x - 0.1 * p.s, p.y - 0.15 * p.s, (0.3 + h * 0.1) * p.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Low wooden fences that split the lane in three.
function drawFences(ctx, game, cam) {
  for (const split of game.level.splits ?? []) {
    const a = Math.max(split.d, cam - NEAR);
    const b = Math.min(split.d + split.length, cam + FAR);
    if (a >= b) continue;
    // Tint the middle lane: that's where the horde comes.
    strip(ctx, cam, -DIVIDER_X, DIVIDER_X, a, b, 'rgba(160, 60, 40, 0.12)');
    for (const x of [-DIVIDER_X, DIVIDER_X]) {
      ctx.lineCap = 'round';
      for (const [z, color, width] of [[0.55, C.fence, 0.12], [0.3, C.fenceLight, 0.08]]) {
        const p0 = project(cam, x, a, z);
        const p1 = project(cam, x, b, z);
        if (!p0 || !p1) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, width * p0.s);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.strokeStyle = C.fence;
      for (let y = Math.ceil(a / 1.5) * 1.5; y <= b; y += 1.5) {
        const bottom = project(cam, x, y, 0);
        const top = project(cam, x, y, 0.65);
        if (!bottom || !top) continue;
        ctx.lineWidth = Math.max(1.5, 0.1 * bottom.s);
        ctx.beginPath();
        ctx.moveTo(bottom.x, bottom.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
      }
    }
  }
}

function label(ctx, text, x, y, size, fill = C.white) {
  ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

const BREED_TAG = { smooth: 'SMOOTH', wire: 'WIRE-HAIR', long: 'LONG-HAIR', dapple: 'DAPPLE' };

// What a prize gives you, written out: "+5", "×2", or "+4 WIRE-HAIR".
const prizeText = op => (op.breed ? `+${op.add} ${BREED_TAG[op.breed]}` : gateLabel(op));

function drawGate(ctx, gate, i, cam, game, time) {
  // Which gate you're lined up with, once it's close enough to matter.
  const near = gate.d - game.pack.y < 30;
  const lined = game.pack.x < 0 ? 'left' : 'right';
  const pulse = 0.5 + 0.5 * Math.sin(time / 150);
  for (const [side, op] of [['left', gate.left], ['right', gate.right]]) {
    const x0 = side === 'left' ? -LANE_HALF : 0;
    const x1 = side === 'left' ? 0 : LANE_HALF;
    const good = gateIsGood(op);
    const chosen = near && side === lined;
    const pts = [project(cam, x0 + 0.1, gate.d, 0), project(cam, x1 - 0.1, gate.d, 0), project(cam, x1 - 0.1, gate.d, 1.8), project(cam, x0 + 0.1, gate.d, 1.8)];
    const fill = good ? `rgba(59, 130, 246, ${chosen ? 0.75 : 0.5})` : `rgba(225, 54, 54, ${chosen ? 0.75 : 0.5})`;
    quad(ctx, pts, fill, chosen ? `rgba(255, 255, 255, ${0.6 + 0.4 * pulse})` : good ? C.goodEdge : C.badEdge, chosen ? 6 : 3);
    const mid = project(cam, (x0 + x1) / 2, gate.d, 1.05);
    if (!mid) continue;
    // Far-off gates stay plain coloured panels until they're close enough to read.
    const ahead = gate.d - game.pack.y;
    if (ahead > 45) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (45 - ahead) / 8);
    const size = Math.max(14, Math.min(48, 0.8 * mid.s));
    if (op.breed) {
      // The pup you'll get, by face and by name.
      drawPupFace(ctx, op.breed, mid.x - size * 1.1, mid.y - size * 0.1, size * 1.1);
      label(ctx, `+${op.add}`, mid.x + size * 0.5, mid.y - size * 0.1, size);
      label(ctx, BREED_TAG[op.breed], mid.x, mid.y - size * 0.85, size * 0.45);
    } else {
      label(ctx, gateLabel(op), mid.x, mid.y, size * 1.1);
    }
    // What your pack would become.
    if (near) {
      const after = gatePreview(game, op);
      const below = project(cam, (x0 + x1) / 2, gate.d, 0.3);
      label(ctx, `→ ${after} pups`, below.x, below.y, Math.max(12, size * 0.42), after >= packSize(game) ? '#d7ecff' : '#ffd0d0');
    }
    ctx.restore();
  }
  // Posts at both edges and in the middle.
  for (const x of [-LANE_HALF, 0, LANE_HALF]) {
    const bottom = project(cam, x, gate.d, 0);
    const top = project(cam, x, gate.d, 2);
    if (!bottom || !top) continue;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2, 0.12 * bottom.s);
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
  }
}

// A wooden crate of pups (left lane) or a steel cage (right lane), with a
// bar showing how much shooting it still needs and a sign saying what's inside.
function drawCrate(ctx, c, cam, time, game) {
  const H = c.cage ? 1.6 : 1.3;
  const x0 = c.x - CRATE.width / 2;
  const x1 = c.x + CRATE.width / 2;
  const y0 = c.y - CRATE.depth / 2;
  const y1 = c.y + CRATE.depth / 2;
  const front = [project(cam, x0, y0, 0), project(cam, x1, y0, 0), project(cam, x1, y0, H), project(cam, x0, y0, H)];
  if (front.some(p => !p)) return;
  const [main, dark, top] = c.cage ? [C.cage, C.cageDark, C.cageTop] : [C.crate, C.crateDark, C.crateTop];
  quad(ctx, [project(cam, x0, y0, H), project(cam, x1, y0, H), project(cam, x1, y1, H), project(cam, x0, y1, H)], top, dark);
  // Pups waiting inside, peeking out.
  quad(ctx, front, main, dark, 3);
  const inside = project(cam, c.x, y0, H * 0.45);
  const peek = c.reward.breed ?? 'smooth';
  for (const dx of [-0.6, 0, 0.6]) {
    drawPupFace(ctx, peek, inside.x + dx * inside.s, inside.y + Math.sin(time / 300 + dx * 3) * 0.04 * inside.s, inside.s * 0.42);
  }
  ctx.strokeStyle = dark;
  if (c.cage) {
    // Steel bars.
    ctx.lineWidth = Math.max(2, 0.07 * inside.s);
    for (let k = 1; k < 9; k++) {
      const x = x0 + (k * CRATE.width) / 9;
      const b = project(cam, x, y0, 0.05);
      const t = project(cam, x, y0, H - 0.05);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
  } else {
    // Planks and a cross brace, with gaps to peek through.
    ctx.lineWidth = Math.max(2, 0.1 * inside.s);
    ctx.beginPath();
    ctx.moveTo(front[0].x, front[0].y);
    ctx.lineTo(front[2].x, front[2].y);
    ctx.moveTo(front[1].x, front[1].y);
    ctx.lineTo(front[3].x, front[3].y);
    ctx.stroke();
  }
  if (c.hit > 0) quad(ctx, front, 'rgba(255,255,255,0.45)');

  // Signs only once it's close enough to read, so the horizon stays clear.
  const ahead = c.y - game.pack.y;
  if (ahead > 38) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (38 - ahead) / 8);
  // How much shooting it still needs: a bar that drains as you hit it, with the number.
  const barL = project(cam, x0 + 0.15, y0, H + 0.15);
  const barR = project(cam, x1 - 0.15, y0, H + 0.15);
  const barH = Math.max(6, 0.16 * barL.s);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(barL.x, barL.y - barH / 2, barR.x - barL.x, barH);
  ctx.fillStyle = c.cage ? '#ffb020' : '#7ddc4a';
  ctx.fillRect(barL.x + 1, barL.y - barH / 2 + 1, (barR.x - barL.x - 2) * Math.max(0, c.hp / c.maxHp), barH - 2);
  label(ctx, String(Math.ceil(c.hp)), (barL.x + barR.x) / 2, barL.y, Math.max(11, barH * 1.1));

  // The prize, on a sign above: FREE +10.
  const sign = project(cam, c.x, y0, H + 0.75);
  const size = Math.max(13, Math.min(34, 0.42 * sign.s));
  const text = `FREE ${prizeText(c.reward)}`;
  ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * (c.reward.breed ? 2.2 : 1);
  const h = size * 1.5;
  ctx.fillStyle = gateIsGood(c.reward) ? C.goodEdge : C.badEdge;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(sign.x - w / 2, sign.y - h / 2, w, h, h / 3);
  else ctx.rect(sign.x - w / 2, sign.y - h / 2, w, h);
  ctx.fill();
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (c.reward.breed) {
    drawPupFace(ctx, c.reward.breed, sign.x - w / 2 + size * 0.85, sign.y, size * 1.1);
    label(ctx, text, sign.x + size * 0.5, sign.y, size);
  } else {
    label(ctx, text, sign.x, sign.y, size);
  }
  // Remind you what it'll do for the pack once it's close.
  if (c.y - game.pack.y < 30) {
    const after = gatePreview(game, c.reward);
    label(ctx, `→ ${after} pups`, sign.x, sign.y - h * 0.95, Math.max(11, size * 0.6), '#d7ecff');
  }
  ctx.restore();
}

function drawShot(ctx, s, cam) {
  if (s.kind === 'bark') {
    // A little "woof" ring.
    const p = project(cam, s.x, s.y, 0.35);
    if (!p) return;
    ctx.strokeStyle = C.white;
    ctx.lineWidth = Math.max(1.5, 0.05 * p.s);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 0.14 * p.s, 0.1 * p.s, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.kind === 'bristle') {
    const len = 0.15 / Math.hypot(s.vx, s.vy);
    const a = project(cam, s.x - s.vx * len, s.y - s.vy * len, 0.35);
    const b = project(cam, s.x + s.vx * len, s.y + s.vy * len, 0.35);
    if (!a || !b) return;
    ctx.strokeStyle = '#3a2d22';
    ctx.lineWidth = Math.max(1.5, 0.05 * a.s);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else {
    // The King's dirt clods arc through the air.
    const p = project(cam, s.x, s.y, 0.4 + Math.sin(Math.min(1, s.life / 2.5) * Math.PI) * 1.2);
    if (!p) return;
    ctx.fillStyle = C.clod;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.3 * p.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function shadow(ctx, cam, x, y, r) {
  const p = project(cam, x, y, 0);
  if (!p) return;
  ctx.fillStyle = 'rgba(60, 40, 20, 0.22)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * p.s, r * p.s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Badgers march straight at you, so they're drawn face-on: hackles up,
// glowing eyes, jaws open. `r` is the badger's radius in pixels; the origin
// is at its feet, up is negative y. `close` (0..1) is how near it is to the
// pack: the closer, the harder it lunges and the brighter its eyes burn.
function badgerFront(ctx, r, kind, time, seed, { bucket = false, crown = false, close = 0 } = {}) {
  const honey = kind === 'honey';
  const step = Math.sin(time / 110 + seed);
  const lunge = close * (0.5 + 0.5 * Math.sin(time / 70 + seed)) * 0.08 * r;
  const bob = Math.abs(step) * 0.05 * r + lunge;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.strokeStyle = C.ink;
  ctx.translate(0, -bob);

  // Hackles: a ridge of spiky fur standing up along the back.
  ctx.fillStyle = honey ? '#0c0c0e' : '#3e4246';
  ctx.beginPath();
  ctx.moveTo(-0.9 * r, -0.95 * r);
  for (let k = 0; k <= 10; k++) {
    const x = -0.9 * r + (k * 1.8 * r) / 10;
    const rise = Math.sqrt(Math.max(0, 1 - (x / (0.95 * r)) ** 2));
    ctx.lineTo(x, -(0.95 + rise * (k % 2 ? 0.42 : 0.28)) * r);
  }
  ctx.lineTo(0.9 * r, -0.95 * r);
  ctx.closePath();
  ctx.fill();

  // Body, a low wide mound behind the head, lighter on top.
  const body = ctx.createLinearGradient(0, -1.4 * r, 0, -0.2 * r);
  body.addColorStop(0, honey ? '#34343a' : '#8f9399');
  body.addColorStop(1, honey ? '#0e0e10' : '#4d5156');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -0.72 * r, 0.98 * r, 0.62 * r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (honey) {
    // The honey badger's silver cape over its head and back.
    ctx.fillStyle = C.honeyCape;
    ctx.beginPath();
    ctx.ellipse(0, -1.05 * r, 0.82 * r, 0.3 * r, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(0, -1.05 * r, 0.82 * r, 0.12 * r, 0, 0, Math.PI);
    ctx.fill();
  }

  // Front paws stomping, with long hooked claws.
  for (const side of [-1, 1]) {
    const lift = (side * step > 0 ? 0.08 : 0) * r;
    ctx.fillStyle = '#121214';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(side * 0.42 * r - 0.17 * r, -0.36 * r - lift, 0.34 * r, 0.36 * r, 0.12 * r);
    else ctx.rect(side * 0.42 * r - 0.17 * r, -0.36 * r - lift, 0.34 * r, 0.36 * r);
    ctx.fill();
    ctx.fillStyle = '#efe8d6';
    for (const cx of [-0.11, 0, 0.11]) {
      const x = side * 0.42 * r + cx * r;
      ctx.beginPath();
      ctx.moveTo(x - 0.035 * r, -0.03 * r - lift);
      ctx.quadraticCurveTo(x + 0.02 * r, 0.06 * r - lift, x - 0.01 * r, 0.12 * r - lift);
      ctx.lineTo(x + 0.035 * r, -0.03 * r - lift);
      ctx.fill();
    }
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.2, r * 0.07);

  // Ears, pinned back.
  for (const side of [-1, 1]) {
    ctx.fillStyle = honey ? '#2a2a2e' : '#4a4e53';
    ctx.beginPath();
    ctx.ellipse(side * 0.42 * r, -0.95 * r, 0.14 * r, 0.09 * r, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Head: the white face with two black stripes (a dark face on a honey badger).
  ctx.fillStyle = honey ? '#1c1c1f' : '#ece9e0';
  ctx.beginPath();
  ctx.ellipse(0, -0.62 * r, 0.5 * r, 0.42 * r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!honey) {
    ctx.fillStyle = '#141416';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 0.2 * r, -0.72 * r, 0.12 * r, 0.33 * r, side * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Eyes that glow red, brighter the closer it gets.
  const glowR = (0.16 + 0.1 * close) * r;
  for (const side of [-1, 1]) {
    const ex = side * 0.2 * r;
    const ey = -0.68 * r;
    const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, glowR);
    glow.addColorStop(0, `rgba(255, 60, 40, ${0.55 + 0.4 * close})`);
    glow.addColorStop(1, 'rgba(255, 60, 40, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ex, ey, glowR, 0, Math.PI * 2);
    ctx.fill();
    // Narrow, slanted, furious.
    ctx.fillStyle = '#ffe2a8';
    ctx.beginPath();
    ctx.moveTo(ex - side * 0.1 * r, ey - 0.04 * r);
    ctx.lineTo(ex + side * 0.09 * r, ey + 0.03 * r);
    ctx.lineTo(ex - side * 0.08 * r, ey + 0.05 * r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c4100b';
    ctx.beginPath();
    ctx.arc(ex, ey + 0.015 * r, 0.03 * r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Heavy brows slammed down into a V.
  ctx.strokeStyle = '#0b0b0c';
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 0.36 * r, -0.86 * r);
    ctx.lineTo(side * 0.06 * r, -0.74 * r);
  }
  ctx.stroke();
  // Snout and a wide-open snarl full of jagged teeth.
  ctx.fillStyle = honey ? '#3a3a3e' : '#cfc8bb';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.2, r * 0.06);
  ctx.beginPath();
  ctx.ellipse(0, -0.45 * r, 0.2 * r, 0.12 * r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.ellipse(0, -0.5 * r, 0.09 * r, 0.06 * r, 0, 0, Math.PI * 2);
  ctx.fill();
  const jaw = (0.12 + 0.06 * close + 0.03 * Math.sin(time / 90 + seed)) * r;
  ctx.fillStyle = '#5a0e0e';
  ctx.beginPath();
  ctx.ellipse(0, -0.32 * r, 0.24 * r, jaw, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c23b3b';
  ctx.beginPath();
  ctx.ellipse(0, -0.32 * r + jaw * 0.45, 0.12 * r, jaw * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbf6ea';
  for (const [top, n] of [[true, 6], [false, 5]]) {
    const y = -0.32 * r + (top ? -jaw : jaw);
    for (let k = 0; k < n; k++) {
      const x = -0.2 * r + ((k + (top ? 0.5 : 1)) * 0.4 * r) / (n + 0.5);
      const fang = k === 0 || k === n - 1 ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(x - 0.03 * r, y);
      ctx.lineTo(x, y + (top ? 1 : -1) * 0.07 * r * fang);
      ctx.lineTo(x + 0.03 * r, y);
      ctx.fill();
    }
  }

  if (bucket) {
    // A dented, spiked bucket for a helmet.
    const steel = ctx.createLinearGradient(-0.45 * r, 0, 0.45 * r, 0);
    steel.addColorStop(0, '#6f7880');
    steel.addColorStop(0.45, '#c9d0d6');
    steel.addColorStop(1, '#5f6870');
    ctx.fillStyle = steel;
    ctx.strokeStyle = '#3b4249';
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(-0.52 * r, -0.8 * r);
    ctx.lineTo(0.52 * r, -0.8 * r);
    ctx.lineTo(0.38 * r, -1.22 * r);
    ctx.lineTo(-0.38 * r, -1.22 * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.46 * r, -0.98 * r);
    ctx.lineTo(0.46 * r, -0.98 * r);
    ctx.stroke();
    ctx.fillStyle = '#d5dbe0';
    for (const sx of [-0.25, 0, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(sx * r - 0.06 * r, -1.22 * r);
      ctx.lineTo(sx * r, -1.42 * r);
      ctx.lineTo(sx * r + 0.06 * r, -1.22 * r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  if (crown) {
    ctx.fillStyle = C.crown;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2, r * 0.04);
    ctx.beginPath();
    ctx.moveTo(-0.38 * r, -0.96 * r);
    for (let i = 0; i <= 4; i++) ctx.lineTo(-0.38 * r + (i * 0.76 * r) / 4, (i % 2 ? -1.12 : -1.42) * r);
    ctx.lineTo(0.38 * r, -0.96 * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8463a';
    for (const cx of [-0.19, 0.19]) {
      ctx.beginPath();
      ctx.arc(cx * r, -1.05 * r, 0.05 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBadger(ctx, b, cam, time) {
  const kind = BADGERS[b.kind];
  const p = project(cam, b.x, b.y, 0);
  if (!p || p.y < HORIZON - 10) return;
  shadow(ctx, cam, b.x, b.y, kind.radius);
  const r = kind.radius * p.s * 1.9;
  const close = Math.max(0, Math.min(1, 1 - (b.y - cam) / 12));
  ctx.save();
  ctx.translate(p.x, p.y);
  badgerFront(ctx, r, b.kind, time, b.id, { bucket: b.kind === 'armored', close });
  if (b.hit > 0) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.ellipse(0, -0.7 * r, r, 0.65 * r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (b.hp < b.maxHp && b.maxHp > BADGERS.badger.hp) healthBar(ctx, p.x, p.y - r * 1.6, r * 1.8, b.hp / b.maxHp);
}

function healthBar(ctx, cx, y, w, frac) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(cx - w / 2, y, w, 6);
  ctx.fillStyle = '#e8463a';
  ctx.fillRect(cx - w / 2 + 1, y + 1, (w - 2) * Math.max(0, frac), 4);
}

function drawBoss(ctx, boss, cam, time) {
  const p = project(cam, boss.x, boss.y, 0);
  if (!p) return;
  shadow(ctx, cam, boss.x, boss.y, BOSS.radius * 1.1);
  const r = BOSS.radius * p.s * 1.35;
  ctx.save();
  ctx.translate(p.x, p.y);
  badgerFront(ctx, r, 'badger', time * 0.6, 0, { crown: true, close: 1 });
  if ((boss.hit ?? 0) > 0) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.ellipse(0, -0.7 * r, r, 0.65 * r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawPupAt(ctx, p, pos, cam, time) {
  const at = project(cam, pos.x, pos.y, 0);
  if (!at) return;
  shadow(ctx, cam, pos.x, pos.y, 0.34 * TIERS[p.tier].scale);
  drawPup(ctx, p, at, time, at.s * 1.7 * TIERS[p.tier].scale);
}

// Your pups face up the road, away from you, so we see them from behind:
// rump and wagging tail nearest, the long back running away from us, and
// the head with its floppy ears at the far end. Merged dogs are bigger and,
// being dachshunds, mostly longer, with extra pairs of legs to hold the
// middle up. Origin at the feet; `ppm` is pixels per metre at its distance.
const STRETCH = [1, 1.3, 3, 5, 7.5];
export function drawPup(ctx, p, at, time, ppm) {
  const c = PUPS[p.breed];
  const m = v => v * ppm;
  const breed = BREEDS[p.breed];
  // A little hop each time it barks.
  const fired = !p.dash && p.cooldown !== undefined && p.cooldown > breed.cooldown - 0.12;
  const hop = fired ? m(0.03) : 0;
  const scamper = p.dash ? Math.sin(time / 35 + p.id) * m(0.02) : 0;
  const wag = Math.sin(time / 85 + (p.id ?? 0) * 1.3);
  const stretch = STRETCH[p.tier ?? 1];
  // How far up the screen the shoulders and head sit: further on a longer dog.
  const along = 0.12 * stretch;
  ctx.save();
  ctx.translate(at.x, at.y - hop);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const line = Math.max(1, m(0.016));
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = line;

  // Back legs, planted (or scampering on zoomies).
  ctx.fillStyle = c.outline;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * m(0.085), -m(0.03) + side * scamper, m(0.04), m(0.04), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Front legs, peeking out further up, and more pairs along a long dog's middle.
  const pairs = Math.min(7, Math.max(1, Math.round(stretch * 1.2) - 1));
  for (let k = 1; k <= pairs; k++) {
    const y = -m(0.15 + (along * k) / pairs);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * m(0.072), y - side * scamper * (k % 2 ? 1 : -1), m(0.03), m(0.03), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.breed === 'long') {
    // Feathery fringe hanging off both sides.
    ctx.fillStyle = c.ear;
    ctx.beginPath();
    ctx.ellipse(0, -m(0.05 + along / 2 + 0.06), m(0.15), m(0.06 + along / 2 + 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // The long back, running away from us, then the rump in front of it.
  const back = ctx.createLinearGradient(-m(0.12), 0, m(0.12), 0);
  back.addColorStop(0, c.outline);
  back.addColorStop(0.35, c.body);
  back.addColorStop(0.6, c.light);
  back.addColorStop(1, c.body);
  ctx.fillStyle = back;
  ctx.beginPath();
  ctx.ellipse(0, -m(0.1 + along / 2), m(0.1), m(0.01 + along / 2 + 0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -m(0.1), m(0.13), m(0.095), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (p.breed === 'dapple') {
    ctx.fillStyle = c.light;
    for (const [dx, dy, r] of [[-0.06, -0.11, 0.03], [0.05, -0.2, 0.025], [-0.02, -0.27, 0.02], [0.07, -0.08, 0.02]]) {
      ctx.beginPath();
      ctx.arc(m(dx), m(dy), m(r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.breed === 'wire') {
    // Scruffy coat sticking out all round.
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = line;
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rx = k % 2 ? 0.13 : 0.1;
      const cy = k < 6 ? -0.1 : -(0.1 + along);
      ctx.moveTo(Math.cos(a) * m(rx), m(cy) + Math.sin(a) * m(0.09));
      ctx.lineTo(Math.cos(a) * m(rx + 0.03), m(cy) + Math.sin(a) * m(0.11));
    }
    ctx.stroke();
  }
  // Head at the far end, with ears hanging either side.
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = line;
  const headY = 0.24 + along;
  ctx.beginPath();
  ctx.ellipse(0, -m(headY), m(0.085), m(0.075), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const earLen = p.breed === 'long' ? 0.09 : 0.065;
  ctx.fillStyle = c.ear;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * m(0.085), -m(headY - 0.03) + m(earLen) * 0.4, m(0.035), m(earLen), side * 0.25 + (fired ? side * 0.3 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Tail up and wagging, right in front of us.
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = m(p.breed === 'long' ? 0.05 : 0.032);
  ctx.beginPath();
  ctx.moveTo(0, -m(0.13));
  ctx.quadraticCurveTo(wag * m(0.05), -m(0.2), wag * m(0.08), -m(0.26));
  ctx.stroke();
  ctx.strokeStyle = p.breed === 'long' ? c.light : c.body;
  ctx.lineWidth = m(p.breed === 'long' ? 0.032 : 0.018);
  ctx.stroke();
  if (p.hp !== undefined && p.hp < breed.hp) {
    // A bandage on a bitten long-hair.
    ctx.fillStyle = C.white;
    ctx.fillRect(-m(0.09), -m(0.13), m(0.18), m(0.035));
  }
  ctx.restore();
}

// A pup's face, for icons on gates, crate signs and the HUD.
export function drawPupFace(ctx, breed, x, y, size) {
  const c = PUPS[breed];
  const m = v => v * size;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, m(0.06));
  ctx.strokeStyle = c.outline;
  ctx.lineJoin = 'round';
  const earLen = breed === 'long' ? 0.5 : 0.38;
  ctx.fillStyle = c.ear;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * m(0.42), m(0.08), m(0.17), m(earLen), side * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, m(0.36), m(0.38), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (breed === 'dapple') {
    ctx.fillStyle = c.light;
    ctx.beginPath();
    ctx.arc(m(0.14), -m(0.18), m(0.08), 0, Math.PI * 2);
    ctx.arc(-m(0.18), m(0.05), m(0.06), 0, Math.PI * 2);
    ctx.fill();
  }
  // Muzzle, nose and eyes.
  ctx.fillStyle = c.light;
  ctx.beginPath();
  ctx.ellipse(0, m(0.16), m(0.19), m(0.15), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.ellipse(0, m(0.1), m(0.08), m(0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * m(0.14), -m(0.07), m(0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  if (breed === 'wire') {
    // Bushy brows and a beard.
    ctx.fillStyle = c.light;
    ctx.fillRect(-m(0.24), -m(0.17), m(0.18), m(0.05));
    ctx.fillRect(m(0.06), -m(0.17), m(0.18), m(0.05));
    ctx.beginPath();
    ctx.moveTo(-m(0.14), m(0.24));
    ctx.lineTo(0, m(0.42));
    ctx.lineTo(m(0.14), m(0.24));
    ctx.fill();
  }
  ctx.restore();
}

function drawFx(ctx, f, cam, time) {
  const age = (time - f.born) / 1000;
  if (age > 0.8) return;
  const p = project(cam, f.x, f.y, 0.4);
  if (!p) return;
  const k = p.s / 45;
  ctx.save();
  ctx.globalAlpha = 1 - age / 0.8;
  if (f.type === 'bop') {
    // Stars where a badger went down.
    ctx.fillStyle = '#ffe14d';
    for (let n = 0; n < 5; n++) {
      const a = (n / 5) * Math.PI * 2 + age * 4;
      const d = (6 + age * 30) * k;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * SQUASH, 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.type === 'yelp') {
    label(ctx, 'yip!', p.x, p.y - (12 + age * 30) * k, 15 * k);
  } else if (f.type === 'splat') {
    ctx.fillStyle = C.clod;
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * age * 30 * k, p.y + Math.sin(a) * age * 30 * k * SQUASH, 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.type === 'merge') {
    label(ctx, `${TIERS[f.tier].name} dog!`, p.x, p.y - (50 + age * 40) * k, 22, '#ffe14d');
  } else if (f.type === 'gate' || f.type === 'crate') {
    label(ctx, f.text, p.x, p.y - (70 + age * 50) * k, 34, f.good ? '#bfe0ff' : '#ffc4c4');
  }
  ctx.restore();
}

// How many pups you've got, floating over the pack.
// How many pups you've got, in a badge at the bottom of the screen, out of the way.
function drawCount(ctx, game) {
  if (!game.pups.length) return;
  const n = packSize(game);
  const text = `${n} ${n === 1 ? 'pup' : 'pups'}`;
  ctx.font = '800 21px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 52;
  const h = 34;
  const x = VIEW_W / 2;
  const y = VIEW_H - 22;
  ctx.fillStyle = 'rgba(30, 20, 16, 0.78)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  drawPupFace(ctx, 'smooth', x - w / 2 + 19, y, 19);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 11, y + 1);
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
  label(ctx, `${game.kills}`, x0 - 22, 22, 18);

  // Who's in the pack.
  const counts = Object.keys(PUPS).map(breed => [breed, game.pups.filter(p => p.breed === breed).reduce((n, p) => n + p.size, 0)]).filter(([, n]) => n);
  let x = 16;
  for (const [breed, n] of counts) {
    drawPupFace(ctx, breed, x + 8, 56, 20);
    ctx.textAlign = 'left';
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.fillStyle = C.white;
    ctx.strokeText(`${n}`, x + 20, 58);
    ctx.fillText(`${n}`, x + 20, 58);
    x += 58;
  }

  if (game.boss && game.boss.hp > 0 && game.boss.y - game.pack.y < 24) {
    label(ctx, 'THE BADGER KING', VIEW_W / 2, 92, 16);
    healthBar(ctx, VIEW_W / 2, 104, VIEW_W - 80, game.boss.hp / game.boss.maxHp);
  }
}
