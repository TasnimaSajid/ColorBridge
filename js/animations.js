/* ============================================================
   animations.js — easing curves, screen shake, and floating
   score popups. Small reusable animation primitives.
   ============================================================ */
"use strict";

const Ease = {
  linear:      t => t,
  inQuad:      t => t * t,
  outQuad:     t => t * (2 - t),
  inOutQuad:   t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic:     t => t * t * t,
  outCubic:    t => 1 - Math.pow(1 - t, 3),
  outBack:     t => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
  outElastic:  t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
};

/* ---------- Screen shake: call trigger(), read offset each frame ---------- */
class ScreenShake {
  constructor() { this.time = 0; this.dur = 0; this.mag = 0; this.x = 0; this.y = 0; }

  /** mag = pixels, dur = ms. Gentle by design — this game should feel relaxing. */
  trigger(mag, dur = 260) {
    // Keep the stronger of a running shake vs the new one.
    if (mag >= this.mag * (1 - this.time / Math.max(this.dur, 1))) {
      this.mag = mag; this.dur = dur; this.time = 0;
    }
  }

  update(dt) {
    if (this.time >= this.dur) { this.x = this.y = 0; return; }
    this.time += dt;
    const decay = 1 - clamp(this.time / this.dur, 0, 1);
    const m = this.mag * decay * decay;
    this.x = rand(-m, m);
    this.y = rand(-m, m);
  }
}

/* ---------- Floating text popups: "+1", "PERFECT ×3!", "+1 gem" ---------- */
class Popups {
  constructor() { this.items = []; }

  add(x, y, text, { color = "#ffffff", size = 22, life = 900 } = {}) {
    this.items.push({ x, y, text, color, size, life, t: 0 });
  }

  clear() { this.items.length = 0; }

  update(dt) {
    for (const p of this.items) p.t += dt;
    this.items = this.items.filter(p => p.t < p.life);
  }

  /** Drawn in world space — caller has already applied the camera transform. */
  draw(ctx) {
    for (const p of this.items) {
      const k = p.t / p.life;
      const rise = Ease.outCubic(k) * 46;
      const scaleIn = k < 0.18 ? Ease.outBack(k / 0.18) : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      ctx.translate(p.x, p.y - rise);
      ctx.scale(scaleIn, scaleIn);
      ctx.font = `900 ${p.size}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(20,20,45,0.55)";
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
}
