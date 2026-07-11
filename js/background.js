/* ============================================================
   background.js — procedural minimalist backdrop. Blends
   smoothly between the 4 phases of the selected theme pack
   (sunrise → day → sunset → night) as the run progresses.
   Layers: sky gradient, sun/moon, stars, drifting clouds,
   two parallax hill silhouettes.
   ============================================================ */
"use strict";

class Background {
  constructor() {
    this.phaseF = 0;        // continuous phase position, wraps mod 4
    this.cloudDrift = 0;
    // Pre-baked star & cloud fields (deterministic layout, cheap to draw).
    this.stars = [];
    for (let i = 0; i < 40; i++) {
      this.stars.push({ x: seededRand(i * 3), y: seededRand(i * 3 + 1) * 0.55, r: 0.6 + seededRand(i * 3 + 2) * 1.4, tw: seededRand(i * 7) * TAU });
    }
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: seededRand(i * 11) * 1.4, y: 0.08 + seededRand(i * 11 + 1) * 0.3, s: 0.6 + seededRand(i * 11 + 2) * 0.8, spd: 0.3 + seededRand(i * 11 + 3) * 0.7 });
    }
    this.time = 0;
  }

  /** phaseF advances 1 per THEME_CYCLE crossings; wraps over 4 phases. */
  setPhase(f) { this.phaseF = f; }

  /** Blend a palette field between the current and next phase. */
  blend(theme, key, idx) {
    const phases = theme.phases;
    const i = Math.floor(this.phaseF) % 4;
    const j = (i + 1) % 4;
    // Ease the blend so each phase holds, then transitions smoothly.
    const raw = this.phaseF - Math.floor(this.phaseF);
    const t = clamp((raw - 0.65) / 0.35, 0, 1); // last 35% of a phase transitions
    const a = idx !== undefined ? phases[i][key][idx] : phases[i][key];
    const b = idx !== undefined ? phases[j][key][idx] : phases[j][key];
    if (typeof a === "number") return lerp(a, b, Ease.inOutQuad(t));
    return mixHex(a, b, Ease.inOutQuad(t));
  }

  /** Fraction of "nightness" — used to fade stars in/out. */
  starAlpha(theme) { return this.blend(theme, "stars"); }

  update(dt) {
    this.time += dt;
    this.cloudDrift += dt * 0.000012;
  }

  draw(ctx, W, H, cameraX, theme) {
    // --- Sky ---
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, this.blend(theme, "sky", 0));
    sky.addColorStop(0.55, this.blend(theme, "sky", 1));
    sky.addColorStop(1, this.blend(theme, "sky", 2));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // --- Stars (night-weighted) ---
    const sAlpha = this.starAlpha(theme);
    if (sAlpha > 0.02) {
      ctx.save();
      for (const st of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(this.time * 0.002 + st.tw);
        ctx.globalAlpha = sAlpha * tw;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- Sun / moon: drifts across the sky over the phase cycle ---
    const sunColor = this.blend(theme, "sun");
    const cyc = (this.phaseF % 4) / 4;
    const sunX = W * (0.2 + 0.6 * Math.abs(Math.sin(cyc * Math.PI * 2)));
    const sunY = H * 0.16;
    const isNight = sAlpha > 0.6;
    ctx.save();
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, sunColor);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx.globalAlpha = 1;
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, TAU);
    ctx.fill();
    if (isNight) {
      // Bite out of the circle → crescent moon.
      ctx.fillStyle = this.blend(theme, "sky", 0);
      ctx.beginPath();
      ctx.arc(sunX - 11, sunY - 6, 22, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // --- Clouds (soft rounded blobs, slow drift, slight parallax) ---
    const cloudColor = this.blend(theme, "clouds");
    ctx.save();
    ctx.fillStyle = cloudColor;
    ctx.globalAlpha = 0.85;
    for (const c of this.clouds) {
      // Wrap position: base drift + tiny camera parallax.
      let cx = ((c.x + this.cloudDrift * c.spd - cameraX * 0.00006) % 1.4);
      if (cx < -0.2) cx += 1.4;
      const px = cx * W - W * 0.1;
      const py = c.y * H;
      const s = c.s * 26;
      ctx.beginPath();
      ctx.arc(px, py, s, 0, TAU);
      ctx.arc(px + s * 0.9, py + s * 0.25, s * 0.7, 0, TAU);
      ctx.arc(px - s * 0.9, py + s * 0.28, s * 0.65, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // --- Parallax hills: 2 layers of smooth sine silhouettes ---
    this.hills(ctx, W, H, cameraX * 0.06, this.blend(theme, "hills", 0), H * 0.60, 46, 0);
    this.hills(ctx, W, H, cameraX * 0.12, this.blend(theme, "hills", 1), H * 0.68, 34, 50);

    // --- Scenery silhouettes on the near hills (pines / cacti / skyline) ---
    this.scenery(ctx, W, H, cameraX * 0.16, theme);
  }

  /**
   * Deterministic strip of silhouettes that scrolls with a stronger
   * parallax than the hills, sitting just above the platform line.
   */
  scenery(ctx, W, H, scroll, theme) {
    const kind = theme.scenery || "pines";
    const col = shadeRgb(this.blend(theme, "hills", 1), 0.55);
    const night = this.starAlpha(theme);
    const spacing = 92;
    const start = Math.floor(scroll / spacing) - 1;
    const count = Math.ceil(W / spacing) + 3;
    for (let i = start; i < start + count; i++) {
      const x = i * spacing + (seededRand(i * 3.3) * 46 - 23) - scroll;
      const s = 0.65 + seededRand(i * 5.7) * 0.75;
      const y = H * 0.705 + seededRand(i * 9.1) * H * 0.02;
      if (kind === "pines") {
        this.pine(ctx, x, y, s, col);
      } else if (kind === "cacti") {
        if (seededRand(i * 7.7) < 0.62) this.cactus(ctx, x, y, s, col);
        else this.rock(ctx, x, y, s, col);
      } else {
        this.building(ctx, x, y, s, col, night, i);
      }
    }
  }

  /** Stylized pine: trunk + three stacked triangles. */
  pine(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x - 2.5 * s, y - 7 * s, 5 * s, 9 * s);
    for (let k = 0; k < 3; k++) {
      const half = (17 - k * 4.5) * s;
      const yk = y - (6 + k * 14) * s;
      ctx.beginPath();
      ctx.moveTo(x - half, yk);
      ctx.lineTo(x + half, yk);
      ctx.lineTo(x, yk - 20 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Saguaro cactus: rounded trunk with two offset arms. */
  cactus(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    // Each arm: a horizontal connector out from the trunk, then an upward tip.
    const arm = (dir, ay, ah) => {
      const reach = 13 * s * dir;
      ctx.beginPath();
      pathRoundRect(ctx, dir > 0 ? x : x + reach, y - ay, Math.abs(reach), 4.5 * s, 2 * s);
      ctx.fill();
      ctx.beginPath();
      pathRoundRect(ctx, x + reach - (dir > 0 ? 4.5 * s : 0), y - ay - ah, 4.5 * s, ah + 3 * s, 2.2 * s);
      ctx.fill();
    };
    // trunk
    ctx.beginPath();
    pathRoundRect(ctx, x - 4.5 * s, y - 44 * s, 9 * s, 44 * s, 4.5 * s);
    ctx.fill();
    arm(-1, 24 * s, 12 * s);
    arm(1, 30 * s, 9 * s);
  }

  /** Small desert boulder. */
  rock(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y - 4 * s, 12 * s, 7 * s, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }

  /** Skyline block with faintly lit windows (brighter at night). */
  building(ctx, x, y, s, col, night, seed) {
    const w = 26 * s;
    const h = (46 + seededRand(seed * 2.1) * 42) * s;
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y - h, w, h);
    if (seededRand(seed * 4.9) > 0.5) ctx.fillRect(x - 1.5, y - h - 8 * s, 3, 8 * s); // antenna
    ctx.fillStyle = `rgba(255,224,140,${0.15 + night * 0.6})`;
    for (let r = 0; r < Math.floor(h / (12 * s)); r++) {
      for (let c = 0; c < 2; c++) {
        if (seededRand(seed * 13.7 + r * 3.1 + c) < 0.55) {
          ctx.fillRect(x - w / 2 + (5 + c * 12) * s, y - h + (6 + r * 12) * s, 5 * s, 6 * s);
        }
      }
    }
  }

  /** One hill silhouette layer built from overlapping sines (seed offsets). */
  hills(ctx, W, H, scroll, color, baseY, amp, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const step = 16;
    for (let x = 0; x <= W + step; x += step) {
      const wx = (x + scroll) * 0.012;
      const y = baseY
        + Math.sin(wx + seed) * amp * 0.6
        + Math.sin(wx * 2.3 + seed * 1.7) * amp * 0.3
        + Math.sin(wx * 0.4 + seed * 0.6) * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}
