import { createGame, step, gateLabel, gateIsGood, finalScore, packSize, steerLimit } from './game.js';
import { VIEW_W, VIEW_H, draw, laneXFromScreen, metresPerScreenPx } from './render.js';

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

// Keep the steering target where the pack can actually get to.
const clampSteer = x => Math.max(-steerLimit(game), Math.min(steerLimit(game), x));

// Screen pixels to canvas pixels: the canvas is drawn at VIEW_W wide and scaled to fit.
const toView = px => (px * VIEW_W) / canvas.getBoundingClientRect().width;

// Drag anywhere to slide the pack: it follows your finger sideways.
canvas.addEventListener('pointerdown', e => {
  if (!overlay.hidden) return;
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  // Start from where the pack really is, so the first nudge always moves it.
  drag = { id: e.pointerId, startX: e.clientX, startSteer: game.pack.x };
});
canvas.addEventListener('pointermove', e => {
  if (drag && drag.id === e.pointerId) {
    steerX = drag.startSteer + toView(e.clientX - drag.startX) * metresPerScreenPx * 1.4;
  } else if (!drag && e.pointerType === 'mouse' && overlay.hidden) {
    // With a mouse, the pack just follows the cursor across the lane.
    steerX = laneXFromScreen(toView(e.clientX - canvas.getBoundingClientRect().left));
  }
  steerX = clampSteer(steerX);
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
    if (ev.type === 'gate' || ev.type === 'crate') {
      const delta = ev.after - ev.before;
      const text = ev.type === 'crate' ? `Freed! ${gateLabel(ev.op)}` : `${gateLabel(ev.op)} → ${ev.after}`;
      fx.push({ type: ev.type, x: game.pack.x, y: game.pack.y, text, good: delta >= 0 && gateIsGood(ev.op), born: now });
    } else if (ev.type === 'bop' || ev.type === 'yelp' || ev.type === 'splat' || ev.type === 'merge') {
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
        showCard('The King is down!', `${packSize(game)} pups made it, ${game.kills} badgers bopped. Score ${score} · Best ${best}.`, 'Play again');
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
    steerX = clampSteer(steerX + (keys.right - keys.left) * KEY_STEER_SPEED * dt);
  }
  if (overlay.hidden || game.phase === 'won' || game.phase === 'lost') {
    // The pack can narrow or widen (gates, merges): keep the target reachable.
    steerX = clampSteer(steerX);
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
  'Dachshund means "badger dog". Hold the road while everything comes at you. Slide your pack left and right to take the gates that grow it — blue is good, red is bad. Where the road splits in three, shoot open the crate on the left or the tough cage on the right to free more pups, while the horde marches down the middle. Smooths bark, wire-hairs spray bristles, long-hairs shield the front, dapples do zoomies. The Badger King waits at the end.',
  'Hold the line!',
);
requestAnimationFrame(frame);
