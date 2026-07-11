/* ============================================================
   utils.js — small math / color / device helpers shared by all
   modules. No game logic here.
   ============================================================ */
"use strict";

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

/** Parse "#rrggbb" into [r,g,b]. */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two hex colors, t in [0,1]. Returns "rgb(...)" string. */
function mixHex(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

/** Hex color with alpha, e.g. rgbaHex("#ff0000", .5). */
function rgbaHex(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Rounded-rect path fallback for older browsers. */
function pathRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(Array.isArray(r) ? Math.max(...r) : r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Darken/lighten an "rgb(...)" or "#hex" color by factor f (e.g. 0.6 = darker). */
function shadeRgb(c, f) {
  const m = c.startsWith("#") ? hexToRgb(c) : c.match(/\d+/g).map(Number);
  return `rgb(${Math.round(m[0] * f)},${Math.round(m[1] * f)},${Math.round(m[2] * f)})`;
}

/** Deterministic pseudo-random in [0,1) from an integer seed (for hills, stars). */
function seededRand(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Vibrate helper — gated by the user's setting and device support. */
function vibrate(pattern) {
  try {
    if (Storage.data.settings.vibration && navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* unsupported — ignore */ }
}
