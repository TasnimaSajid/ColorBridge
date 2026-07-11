/* ============================================================
   character.js — procedural character art. Every character is
   drawn with canvas primitives (no image assets), so all art
   is original. One draw() entry point handles idle, walking,
   falling and shop-preview rendering.
   ============================================================ */
"use strict";

const CharacterArt = {
  /**
   * Draw a character with feet at (x, y).
   * o: { walk: walk-cycle phase (radians), blink: 0..1, squash: 0..1,
   *      angle: body rotation (falling), scale }
   */
  draw(ctx, def, x, y, o = {}) {
    const walk = o.walk || 0;
    const blink = o.blink || 0;
    const squash = o.squash || 0;
    const scale = o.scale || 1;
    const angle = o.angle || 0;

    const W = 36, H = 32; // body box
    const bob = Math.abs(Math.sin(walk)) * 2.5; // hop while walking
    const isGhost = def.kind === "ghost";
    const hover = isGhost ? 4 + Math.sin((o.time || 0) * 0.004) * 2 : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale * (1 + squash * 0.22), scale * (1 - squash * 0.26));

    /* ---- feet (skipped for ghost) ---- */
    if (!isGhost) {
      const lift = Math.sin(walk) * 4;
      ctx.fillStyle = def.accent;
      ctx.beginPath();
      ctx.ellipse(-8, -3 - Math.max(lift, 0), 6, 4, 0, 0, TAU);
      ctx.ellipse(8, -3 - Math.max(-lift, 0), 6, 4, 0, 0, TAU);
      ctx.fill();
    }

    ctx.translate(0, -hover);

    /* ---- body: rounded blob with vertical gradient ---- */
    const grad = ctx.createLinearGradient(0, -H - 6, 0, -2);
    grad.addColorStop(0, def.body);
    grad.addColorStop(1, def.body2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (isGhost) {
      // Dome with a scalloped skirt (right-to-left waves along the bottom).
      ctx.moveTo(-W / 2, -6);
      ctx.quadraticCurveTo(-W / 2, -H - 6, 0, -H - 6);
      ctx.quadraticCurveTo(W / 2, -H - 6, W / 2, -6);
      const seg = W / 4;
      for (let i = 0; i < 4; i++) {
        const x0 = W / 2 - i * seg;
        ctx.quadraticCurveTo(x0 - seg / 2, i % 2 ? -12 : 1, x0 - seg, -6);
      }
      ctx.closePath();
    } else if (def.kind === "robot") {
      pathRoundRect(ctx, -W / 2, -H - 4, W, H, 9);
    } else {
      pathRoundRect(ctx, -W / 2, -H - 4, W, H + 1, 14);
    }
    ctx.fill();

    // Soft top highlight
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-6, -H + 3, 9, 5, -0.5, 0, TAU);
    ctx.fill();

    /* ---- kind-specific features ---- */
    if (def.kind === "cat") {
      ctx.fillStyle = def.body;
      ctx.beginPath();
      ctx.moveTo(-15, -H + 2); ctx.lineTo(-10, -H - 12); ctx.lineTo(-4, -H + 1);
      ctx.moveTo(15, -H + 2); ctx.lineTo(10, -H - 12); ctx.lineTo(4, -H + 1);
      ctx.fill();
      ctx.fillStyle = "#ffe3c2";
      ctx.beginPath();
      ctx.moveTo(-12.5, -H); ctx.lineTo(-10, -H - 8); ctx.lineTo(-6.5, -H);
      ctx.moveTo(12.5, -H); ctx.lineTo(10, -H - 8); ctx.lineTo(6.5, -H);
      ctx.fill();
    } else if (def.kind === "chick") {
      // little feather tuft
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -H - 3); ctx.quadraticCurveTo(-2, -H - 12, -6, -H - 12);
      ctx.moveTo(0, -H - 3); ctx.quadraticCurveTo(3, -H - 11, 6, -H - 10);
      ctx.stroke();
      // beak
      ctx.fillStyle = def.accent;
      ctx.beginPath();
      ctx.moveTo(-4, -H / 2 - 5); ctx.lineTo(4, -H / 2 - 5); ctx.lineTo(0, -H / 2 + 1);
      ctx.closePath();
      ctx.fill();
    } else if (def.kind === "robot") {
      // antenna with glowing tip
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -H - 4); ctx.lineTo(0, -H - 12);
      ctx.stroke();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(0, -H - 14, 3.5, 0, TAU);
      ctx.fill();
      // chest light
      ctx.fillStyle = rgbaHex("#ffffff", 0.5);
      ctx.fillRect(-5, -12, 10, 4);
    }

    /* ---- face ---- */
    const eyeY = def.kind === "chick" ? -H / 2 - 11 : -H / 2 - 8;
    ctx.fillStyle = "#ffffff";
    if (blink < 0.5) {
      ctx.beginPath();
      ctx.ellipse(-7, eyeY, 4.6, def.kind === "robot" ? 4 : 5.2, 0, 0, TAU);
      ctx.ellipse(7, eyeY, 4.6, def.kind === "robot" ? 4 : 5.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#26263e";
      ctx.beginPath();
      ctx.arc(-6, eyeY + 0.5, 2.2, 0, TAU);
      ctx.arc(8, eyeY + 0.5, 2.2, 0, TAU);
      ctx.fill();
      // eye shine
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-6.8, eyeY - 0.6, 0.9, 0, TAU);
      ctx.arc(7.2, eyeY - 0.6, 0.9, 0, TAU);
      ctx.fill();
    } else {
      // closed eyes: happy arcs
      ctx.strokeStyle = "#26263e";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(-7, eyeY, 3.6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.arc(7, eyeY, 3.6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // rosy cheeks
    if (def.kind !== "robot") {
      ctx.fillStyle = "rgba(255,120,140,0.35)";
      ctx.beginPath();
      ctx.ellipse(-11, eyeY + 7, 3.4, 2.2, 0, 0, TAU);
      ctx.ellipse(11, eyeY + 7, 3.4, 2.2, 0, 0, TAU);
      ctx.fill();
    }

    // tiny smile
    ctx.strokeStyle = "#26263e";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, eyeY + 6.5, 3.2, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    ctx.restore();
  },

  /** Soft contact shadow under the character (drawn separately, unrotated). */
  drawShadow(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.fillStyle = "rgba(10,12,35,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 16 * scale, 4.5 * scale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
};
