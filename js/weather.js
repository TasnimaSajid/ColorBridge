/* ============================================================
   weather.js — ambient rain that drifts in and clears on its
   own during a run, for atmosphere "in between" dry stretches.
   Screen-space overlay: slanted streaks + a soft darkening tint,
   with intensity that fades smoothly in and out. Night phases
   are a little rainier. Kept cheap: one pooled path stroke.
   ============================================================ */
"use strict";

class Weather {
  constructor() {
    this.MAX = 110;             // max simultaneous streaks (at full intensity)
    this.slant = 0.22;          // horizontal drift of the rain
    this.drops = [];
    for (let i = 0; i < this.MAX; i++) {
      this.drops.push({
        x: Math.random(),
        y: Math.random(),
        len: 12 + Math.random() * 16,
        speed: 0.7 + Math.random() * 0.6, // relative fall speed
      });
    }
    this.reset();
  }

  /** Back to dry; first shower arrives a little into the run. */
  reset() {
    this.intensity = 0;   // current visible amount 0..1
    this.target = 0;      // where intensity is easing toward
    this.raining = false;
    this.changeIn = rand(4000, 9000);
  }

  get isRaining() { return this.intensity > 0.03; }

  /**
   * Advance rain. `nightness` (0..1) from the background nudges the
   * odds so storms feel more likely under darker skies.
   */
  update(dt, nightness = 0) {
    // Occasionally start or stop a shower.
    this.changeIn -= dt;
    if (this.changeIn <= 0) {
      if (this.raining) {
        this.raining = false;
        this.target = 0;
        this.changeIn = rand(6000, 12000); // dry spell before it could rain again
      } else {
        const startChance = 0.45 + nightness * 0.25;
        if (Math.random() < startChance) {
          this.raining = true;
          this.target = rand(0.5, 1);
          this.changeIn = rand(6000, 13000); // how long this shower lasts
        } else {
          this.changeIn = rand(3000, 7000);  // stay dry, check again soon
        }
      }
    }

    // Ease intensity toward its target (smooth fade in / out).
    const rate = dt / 1500;
    if (this.intensity < this.target) this.intensity = Math.min(this.target, this.intensity + rate);
    else this.intensity = Math.max(this.target, this.intensity - rate);

    // Animate the drop field (normalized coords; wraps around).
    if (this.intensity > 0.01) {
      const s = dt * 0.0018;
      for (const d of this.drops) {
        d.y += d.speed * s;
        d.x += d.speed * s * this.slant;
        if (d.y > 1.06) { d.y -= 1.12; d.x = Math.random(); }
        if (d.x > 1.06) d.x -= 1.12;
      }
    }
  }

  /** Drawn in screen space (over the world, under the DOM UI). */
  draw(ctx, W, H) {
    if (this.intensity <= 0.02) return;
    const k = this.intensity;
    ctx.save();

    // Soft cool tint to sell the overcast mood.
    ctx.fillStyle = `rgba(38, 48, 78, ${k * 0.16})`;
    ctx.fillRect(0, 0, W, H);

    // Rain streaks — a single batched stroke for performance.
    const count = Math.floor(k * this.MAX);
    ctx.strokeStyle = `rgba(205, 222, 255, ${0.32 * k})`;
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const d = this.drops[i];
      const x = d.x * W, y = d.y * H;
      // Streak trails up-and-back from the leading tip.
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.len * this.slant, y - d.len);
    }
    ctx.stroke();
    ctx.restore();
  }
}
