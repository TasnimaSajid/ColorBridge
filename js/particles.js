/* ============================================================
   particles.js — lightweight particle system for confetti,
   landing dust, gem sparkles and fall splashes. Object pool
   kept simple; counts are tuned low for mobile performance.
   ============================================================ */
"use strict";

class Particles {
  constructor() { this.items = []; }

  clear() { this.items.length = 0; }

  /**
   * Generic burst. shape: "circle" | "rect" | "star"
   * All positions are world coordinates.
   */
  burst(x, y, { colors = ["#fff"], count = 12, speed = [0.05, 0.22], up = true,
                gravity = 0.0006, life = [500, 900], size = [3, 6], shape = "circle" } = {}) {
    // Cap the pool so bursts can never pile up into a perf problem.
    if (this.items.length > 220) return;
    for (let i = 0; i < count; i++) {
      const ang = up ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(0, TAU);
      const spd = rand(speed[0], speed[1]);
      this.items.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        gravity,
        life: rand(life[0], life[1]),
        t: 0,
        size: rand(size[0], size[1]),
        color: pick(colors),
        shape,
        rot: rand(0, TAU),
        vr: rand(-0.01, 0.01),
      });
    }
  }

  /* ---------- Named presets ---------- */

  confetti(x, y, colors) {
    this.burst(x, y, { colors, count: 26, speed: [0.08, 0.3], gravity: 0.0007, life: [700, 1300], size: [3, 7], shape: "rect" });
  }

  dust(x, y, color = "#ffffff") {
    this.burst(x, y, { colors: [color], count: 8, speed: [0.03, 0.1], gravity: 0.0002, life: [300, 550], size: [2, 5] });
  }

  sparkle(x, y) {
    this.burst(x, y, { colors: ["#9ff5ff", "#3fd0ff", "#ffffff", "#c4b5ff"], count: 12, speed: [0.05, 0.16], up: false, gravity: 0.0001, life: [400, 750], size: [2, 5], shape: "star" });
  }

  splash(x, y) {
    this.burst(x, y, { colors: ["#ffffff", "#cfd8ff"], count: 14, speed: [0.06, 0.2], gravity: 0.0008, life: [400, 800], size: [2, 5] });
  }

  update(dt) {
    for (const p of this.items) {
      p.t += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.items = this.items.filter(p => p.t < p.life);
  }

  /** Drawn in world space — camera transform already applied by caller. */
  draw(ctx) {
    for (const p of this.items) {
      const k = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size * (0.5 + k * 0.5);
      if (p.shape === "rect") {
        ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
      } else if (p.shape === "star") {
        // 4-point twinkle
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.lineTo(Math.cos(a + TAU / 8) * s * 0.35, Math.sin(a + TAU / 8) * s * 0.35);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s / 2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
