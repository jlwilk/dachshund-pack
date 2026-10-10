import { LANE_HALF, createGame, step, gateLabel, gateIsGood, finalScore } from './game.js';
import { VIEW_W, VIEW_H, draw } from './render.js';

const MAX_FRAME_S = 0.05;
const BEST_KEY = 'dachshund-pack:best';
const KEY_STEER_SPEED = 9; // metres per second while an arrow key is held

const $ = id => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const overlay = $('overlay');

let game = createGame({ seed: Date.now() % 100000 });
let steerX = 0;
let drag = null;
let keys = { left: false, right: false };
let fx = [];
let last = performance.now();
let scale = 1;
let best = 0;
try {
  best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
} catch {
  // Storage blocked: no best score.
}

function showCard(title, message, button) {
  $('title').textContent = title;
  $('message').textContent = message;
  $('go').textContent = button;
  overlay.hidden = false;
  $('go').focus({ preventScroll: true });
}

function start() {
  game = createGame({ seed: Date.now() % 100000 });
  steerX = 0;
  fx = [];
  overlay.hidden = true;
}

const metresPerPx = () => (LANE_HALF * 2 + 1.4) / canvas.getBoundingClientRect().width;

// Drag anywhere to slide the pack: it follows your finger sideways.
canvas.addEventListener('pointerdown', e => {
  if (!overlay.hidden) return;
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  drag = { id: e.pointerId, startX: e.clientX, startSteer: steerX };
});
canvas.addEventListener('pointermove', e => {
  if (drag && drag.id === e.pointerId) {
    steerX = drag.startSteer + (e.clientX - drag.startX) * metresPerPx() * 1.4;
  } else if (!drag && e.pointerType === 'mouse' && overlay.hidden) {
    // With a mouse, the pack just follows the cursor across the lane.
    const r = canvas.getBoundingClientRect();
    steerX = ((e.clientX - r.left) / r.width - 0.5) * (LANE_HALF * 2 + 1.4);
  }
  steerX = Math.max(-LANE_HALF, Math.min(LANE_HALF, steerX));
});
const endDrag = e => {
  if (drag && drag.id === e.pointerId) drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const KEYS = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
window.addEventListener('keydown', e => {
  const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (k) {
    keys[k] = true;
    e.preventDefault();
  } else if ((e.key === ' ' || e.key === 'Enter') && !overlay.hidden && e.target !== $('go')) {
    e.preventDefault();
    start();
  }
});
window.addEventListener('keyup', e => {
  const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (k) keys[k] = false;
});
window.addEventListener('blur', () => {
  keys = { left: false, right: false };
});
$('go').addEventListener('click', start);

function onEvents(events, now) {
  for (const ev of events) {
    if (ev.type === 'gate') {
      const delta = ev.after - ev.before;
      fx.push({ type: 'gate', x: game.pack.x, y: game.pack.y, text: `${gateLabel(ev.op)} → ${ev.after}`, good: delta >= 0 && gateIsGood(ev.op), born: now });
    } else if (ev.type === 'bop' || ev.type === 'yelp' || ev.type === 'splat') {
      fx.push({ ...ev, born: now });
    } else if (ev.type === 'won' || ev.type === 'lost') {
      const score = finalScore(game);
      if (score > best) {
        best = score;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {
          // Storage blocked.
        }
      }
      if (ev.type === 'won') {
        showCard('The King is down!', `${game.pups.length} pups made it, ${game.kills} badgers bopped. Score ${score} · Best ${best}.`, 'Run again');
      } else {
        showCard('The badgers won', `Your pack bopped ${game.kills} badgers before the last pup fell. Score ${score} · Best ${best}.`, 'Try again');
      }
    }
  }
}

function fit() {
  const w = Math.min(stage.clientWidth, (stage.clientHeight * VIEW_W) / VIEW_H);
  if (w <= 0) return;
  const h = (w * VIEW_H) / VIEW_W;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  scale = canvas.width / VIEW_W;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME_S);
  last = now;
  if (keys.left || keys.right) {
    steerX = Math.max(-LANE_HALF, Math.min(LANE_HALF, steerX + (keys.right - keys.left) * KEY_STEER_SPEED * dt));
  }
  if (overlay.hidden || game.phase === 'won' || game.phase === 'lost') {
    const { state, events } = step(game, dt, { steerX });
    game = state;
    onEvents(events, now);
  }
  fx = fx.filter(f => now - f.born < 900);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw(ctx, { game, time: now, fx });
}

new ResizeObserver(fit).observe(stage);
fit();
showCard(
  'Dachshund Pack',
  'Dachshund means "badger dog". Steer your pack through the gates to grow it — blue is good, red is bad — and let the pups do the fighting. Smooths bark, wire-hairs spray bristles, long-hairs shield the front, dapples do zoomies. The Badger King waits at the end.',
  'Run!',
);
requestAnimationFrame(frame);
