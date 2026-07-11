/* ============================================================
   game.js — core gameplay. State machine:

   HOME → READY ⇄ GROWING → DROPPING → WALKING → SHIFTING → READY
                                       ↘ (miss) FALLING → OVER

   The hero stands on a platform; press & hold grows a bridge,
   release drops it forward. Land inside the next platform to
   walk across; near its center is a "perfect" for bonus points.
   ============================================================ */
"use strict";

const GameState = {
  HOME: "home", ENTER: "enter", READY: "ready", GROWING: "growing", DROPPING: "dropping",
  WALKING: "walking", SHIFTING: "shifting", FALLING: "falling", OVER: "over",
};

class Game {
  constructor() {
    this.state = GameState.HOME;
    this.pausedFrom = null;
    this.mode = "endless";  // "endless" | "level"
    this.levelDef = null;   // active LEVELS entry in level mode

    this.shake = new ScreenShake();
    this.popups = new Popups();
    this.particles = new Particles();
    this.bg = new Background();
    this.weather = new Weather();

    this.LH = 800;          // logical height, set by main.js on resize
    this.time = 0;
    this.reset();
  }

  get platformY() { return this.LH * CONFIG.PLATFORM_Y_RATIO; }

  /* ------------------------------------------------------------
     Run setup
     ------------------------------------------------------------ */
  reset() {
    this.score = 0;
    this.gemsRun = 0;
    this.perfectsRun = 0;
    this.combo = 0;
    this.crossings = 0;

    this.platforms = [{ x: -40, w: 150, appear: 1 }];
    this.cameraX = 0;
    this.camFrom = 0;
    this.camTo = 0;
    this.shiftT = 0;

    this.hero = {
      x: this.platforms[0].x + this.platforms[0].w - CONFIG.CHAR_EDGE_OFFSET,
      y: 0, vy: 0, angle: 0,
      walk: 0, squash: 0,
      blinkTimer: rand(1800, 4200), blink: 0,
    };
    this.cameraX = this.hero.x - CONFIG.ANCHOR_X;

    this.bridge = { baseX: 0, len: 0, angle: -Math.PI / 2, dropT: 0, result: null, fallT: 0 };
    this.gem = null;
    this.stepAcc = 0;

    this.popups.clear();
    this.particles.clear();
    this.bg.setPhase(0);
    this.weather.reset();

    this.spawnNext();
    this.next.appear = 1; // first target platform is visible immediately
  }

  /** Endless mode run. */
  startRun() {
    this.mode = "endless";
    this.levelDef = null;
    this.beginRun();
  }

  /** Level-map run: fixed goal, fixed sky, per-level difficulty. */
  startLevel(def) {
    this.mode = "level";
    this.levelDef = def;
    this.beginRun();
    this.bg.setPhase(def.phase);
    UI.updateHUD(`0/${def.goal}`, Storage.data.gems);
  }

  beginRun() {
    this.reset();
    // Intro: the hero drops in from mid-screen (where it stood on the home
    // screen) and lands on the first tower before play begins.
    this.state = GameState.ENTER;
    this.hero.y = -(this.platformY - this.LH * 0.42);
    this.hero.vy = 0;
    this.introY0 = this.hero.y;
    Storage.data.stats.games++;
    Storage.save();
    UI.updateHUD(this.score, Storage.data.gems + this.gemsRun);
  }

  goHome() {
    // Quitting mid-run still banks any gems collected this run.
    if (this.state !== GameState.OVER && this.state !== GameState.HOME && this.gemsRun > 0) {
      Storage.addGems(this.gemsRun);
    }
    this.reset();
    this.state = GameState.HOME;
  }

  /** Current level (1-based); advances every LEVEL_SIZE crossings. */
  get level() { return CONFIG.levelFor(this.crossings); }

  /** HUD score value: "crossed/goal" in level mode, otherwise the raw score. */
  get hudScore() {
    return (this.mode === "level" && this.levelDef) ? `${this.crossings}/${this.levelDef.goal}` : this.score;
  }

  /** Create the next platform after a gap, using the difficulty curve. */
  spawnNext() {
    // Level mode uses the level's own difficulty band; endless uses the curve.
    const d = (this.mode === "level" && this.levelDef) ? this.levelDef : CONFIG.difficulty(this.score);
    const mvChance = (this.mode === "level" && this.levelDef)
      ? this.levelDef.movingChance
      : CONFIG.movingChance(this.level);
    const prev = this.platforms[this.platforms.length - 1];
    const gap = rand(d.gapMin, d.gapMax);
    const w = rand(d.widthMin, d.widthMax);
    const p = { x: prev.x + prev.w + gap, w, appear: 0 };

    // Higher levels: the target tower may slide side-to-side until landed on.
    if (chance(mvChance)) {
      p.move = {
        baseX: p.x,
        amp: Math.min(rand(12, 22) + this.level, gap * 0.25),
        speed: rand(0.0011, 0.0016) + Math.min(this.level, 12) * 0.00008,
        t: rand(0, TAU),
      };
    }

    this.platforms.push(p);
    if (this.platforms.length > 4) this.platforms.shift();

    // Occasionally drop a collectible gem into the gap.
    this.gem = null;
    if (chance(CONFIG.GEM_CHANCE)) {
      const margin = 24 + (p.move ? p.move.amp : 0);
      this.gem = {
        x: rand(prev.x + prev.w + 24, p.x - margin),
        y: this.platformY - 30,
        taken: false, bob: rand(0, TAU),
      };
    }
  }

  /** Platform the hero currently stands on / the one being targeted. */
  get current() { return this.platforms[this.platforms.length - 2]; }
  get next()    { return this.platforms[this.platforms.length - 1]; }

  /* ------------------------------------------------------------
     Input
     ------------------------------------------------------------ */
  press() {
    if (this.state !== GameState.READY) return;
    this.state = GameState.GROWING;
    this.bridge = {
      baseX: this.current.x + this.current.w,
      len: 0, angle: -Math.PI / 2, dropT: 0, result: null, fallT: 0,
    };
    AudioSys.growStart();
    vibrate(8);
  }

  release() {
    if (this.state !== GameState.GROWING) return;
    this.state = GameState.DROPPING;
    this.bridge.dropT = 0;
    AudioSys.growStop();
    AudioSys.drop();
  }

  /* ------------------------------------------------------------
     Update
     ------------------------------------------------------------ */
  update(dt) {
    this.time += dt;
    this.bg.update(dt);
    // Rain only rolls in during actual play; darker skies are a bit rainier.
    if (this.state !== GameState.HOME) {
      this.weather.update(dt, this.bg.starAlpha(Storage.getTheme()));
    }
    this.shake.update(dt);
    this.popups.update(dt);
    this.particles.update(dt);

    // Blink timing (all states — the hero blinks on the home screen too).
    const h = this.hero;
    h.blinkTimer -= dt;
    if (h.blinkTimer < 0) { h.blinkTimer = rand(1800, 4200); h.blink = 1; }
    if (h.blink > 0) h.blink = Math.max(0, h.blink - dt / 140);
    h.squash = Math.max(0, h.squash - dt / 260);

    // Animate a moving target platform (until a bridge locks it in place).
    const np = this.next;
    if (np && np.move) {
      np.move.t += np.move.speed * dt;
      np.x = np.move.baseX + Math.sin(np.move.t) * np.move.amp;
    }

    switch (this.state) {
      case GameState.ENTER: this.updateEnter(dt); break;
      case GameState.GROWING: this.updateGrowing(dt); break;
      case GameState.DROPPING: this.updateDropping(dt); break;
      case GameState.WALKING: this.updateWalking(dt); break;
      case GameState.SHIFTING: this.updateShifting(dt); break;
      case GameState.FALLING: this.updateFalling(dt); break;
    }
  }

  /** Intro drop: gravity fall onto the first tower, then hand over control. */
  updateEnter(dt) {
    const h = this.hero;
    h.vy += 0.0022 * dt;
    h.y += h.vy * dt;
    if (h.y >= 0) {
      h.y = 0;
      h.vy = 0;
      h.squash = 1;
      this.state = GameState.READY;
      this.shake.trigger(2.5, 200);
      this.particles.dust(h.x, this.platformY, "#ffffff");
      AudioSys.land();
      vibrate(12);
    }
  }

  updateGrowing(dt) {
    const speed = Math.min(CONFIG.GROW_SPEED_BASE + this.score * CONFIG.GROW_SPEED_PER_SCORE, CONFIG.GROW_SPEED_MAX);
    this.bridge.len = Math.min(this.bridge.len + speed * dt, this.LH * 0.62);
    AudioSys.growPitch(this.bridge.len);
  }

  updateDropping(dt) {
    const b = this.bridge;
    b.dropT += dt;
    const t = clamp(b.dropT / CONFIG.DROP_TIME, 0, 1);
    b.angle = -Math.PI / 2 + Ease.inQuad(t) * (Math.PI / 2); // gravity feel

    if (t >= 1) {
      b.angle = 0;
      const tip = b.baseX + b.len;
      const p = this.next;
      delete p.move; // the moment the bridge lands, a moving tower locks in place
      const center = p.x + p.w / 2;

      if (tip >= p.x && tip <= p.x + p.w) {
        b.result = Math.abs(tip - center) <= CONFIG.PERFECT_WINDOW ? "perfect" : "good";
        AudioSys.land();
        vibrate(b.result === "perfect" ? [15, 40, 25] : 15);
        this.particles.dust(tip, this.platformY, "#ffffff");
        if (b.result === "perfect") {
          this.shake.trigger(5, 300);
          AudioSys.perfect();
          this.particles.confetti(tip, this.platformY - 8, Storage.getBridge().colors);
        } else {
          this.shake.trigger(2, 180);
        }
      } else {
        b.result = tip < p.x ? "short" : "long";
        AudioSys.land();
      }
      this.state = GameState.WALKING;
      this.walkTarget = (b.result === "good" || b.result === "perfect")
        ? p.x + p.w - CONFIG.CHAR_EDGE_OFFSET  // safe: walk onto the platform
        : b.baseX + b.len + 8;                 // doomed: walk to the bridge tip
    }
  }

  updateWalking(dt) {
    const h = this.hero;
    h.x += CONFIG.WALK_SPEED * dt;
    h.walk += dt * 0.02;

    // Soft footstep ticks.
    this.stepAcc += dt;
    if (this.stepAcc > 160) { this.stepAcc = 0; AudioSys.step(Math.round(h.walk)); }

    // Gem pickup while crossing.
    const g = this.gem;
    if (g && !g.taken && h.x >= g.x - 6) {
      g.taken = true;
      this.gemsRun++;
      AudioSys.gem();
      vibrate(10);
      this.particles.sparkle(g.x, g.y);
      this.popups.add(g.x, g.y - 14, "+1", { color: "#7ef0ff", size: 19 });
      UI.updateHUD(this.hudScore, Storage.data.gems + this.gemsRun);
    }

    if (h.x >= this.walkTarget) {
      h.x = this.walkTarget;
      const r = this.bridge.result;
      if (r === "good" || r === "perfect") this.arrive(r);
      else {
        // Walked off the end — begin the fall.
        this.state = GameState.FALLING;
        h.vy = 0;
        this.bridge.fallT = 0;
        AudioSys.fall();
        vibrate(60);
      }
    }
  }

  /** Successful crossing: score, combo, phase, camera shift. */
  arrive(result) {
    const h = this.hero;
    const p = this.next;
    h.squash = 1;
    const prevLevel = this.level;
    this.crossings++;
    // Level mode keeps its fixed sky; endless cycles through the phases.
    if (this.mode !== "level") this.bg.setPhase(this.crossings / CONFIG.THEME_CYCLE);

    let gained = 1;
    if (result === "perfect") {
      this.combo++;
      this.perfectsRun++;
      const bonus = Math.min(this.combo, CONFIG.MAX_COMBO_BONUS);
      gained += bonus;
      this.popups.add(p.x + p.w / 2, this.platformY - 64,
        this.combo > 1 ? `PERFECT ×${this.combo}!` : "PERFECT!",
        { color: "#ffd166", size: 24 });
      this.popups.add(p.x + p.w / 2, this.platformY - 34, `+${gained}`, { color: "#ffffff", size: 20 });
    } else {
      this.combo = 0;
      this.popups.add(p.x + p.w / 2, this.platformY - 40, "+1", { color: "#ffffff", size: 20 });
    }
    this.score += gained;

    // Live stats for achievements (crossings/perfects/combo/night phase).
    const st = Storage.data.stats;
    st.crossings++;
    if (result === "perfect") {
      st.perfects++;
      if (this.combo > st.bestCombo) st.bestCombo = this.combo;
    }
    if (Math.floor(this.bg.phaseF) % 4 === 3) st.nightReached = true;
    UI.notifyAchievements(Storage.checkAchievements());

    UI.updateHUD(this.hudScore, Storage.data.gems + this.gemsRun);

    // Level goal reached → celebrate instead of scrolling onward.
    if (this.mode === "level" && this.crossings >= this.levelDef.goal) {
      this.levelComplete();
      return;
    }

    // Camera scroll to re-anchor the hero, and reveal the next platform.
    this.state = GameState.SHIFTING;
    this.shiftT = 0;
    this.camFrom = this.cameraX;
    this.camTo = h.x - CONFIG.ANCHOR_X;
    // Level check runs after the camera target is known so the banner centers
    // on where the screen is about to settle (spawnNext also uses the new level).
    if (this.mode !== "level" && this.level > prevLevel) this.levelUp(this.level);
    this.spawnNext();
  }

  /** Map level cleared: stars from perfect landings, bank rewards, celebrate. */
  levelComplete() {
    this.state = GameState.OVER;
    const def = this.levelDef;
    const stars = 1
      + (this.perfectsRun >= Math.ceil(def.goal / 3) ? 1 : 0)
      + (this.perfectsRun >= Math.ceil(def.goal * 2 / 3) ? 1 : 0);
    const firstClear = Storage.getStars(def.id) === 0;
    const bonus = stars * 5 + (firstClear ? 10 : 0);
    Storage.addGems(this.gemsRun + bonus);
    Storage.setStars(def.id, stars);
    AudioSys.achievement();
    vibrate([20, 40, 30]);
    UI.notifyAchievements(Storage.checkAchievements());
    UI.showLevelComplete({
      def, stars,
      gems: this.gemsRun + bonus,
      perfects: this.perfectsRun,
    });
  }

  /** Level-up fanfare: banner, chime, HUD chip, stats + achievements. */
  levelUp(lv) {
    const name = CONFIG.LEVEL_NAMES[(lv - 1) % CONFIG.LEVEL_NAMES.length];
    const cx = this.camTo + CONFIG.LOGICAL_W / 2;
    this.popups.add(cx, this.platformY - this.LH * 0.30, `LEVEL ${lv}`, { color: "#ffd166", size: 34, life: 1500 });
    this.popups.add(cx, this.platformY - this.LH * 0.30 + 32, name, { color: "#ffffff", size: 17, life: 1500 });
    this.shake.trigger(2, 180);
    AudioSys.levelUp();
    vibrate([10, 30, 10]);

    const st = Storage.data.stats;
    if (lv > st.maxLevel) { st.maxLevel = lv; Storage.save(); }
    UI.setLevel(lv);
    UI.notifyAchievements(Storage.checkAchievements());
  }

  updateShifting(dt) {
    this.shiftT += dt;
    const t = clamp(this.shiftT / CONFIG.SHIFT_TIME, 0, 1);
    this.cameraX = lerp(this.camFrom, this.camTo, Ease.outCubic(t));
    this.next.appear = t; // platform pops up as the camera settles
    if (t >= 1) {
      this.next.appear = 1;
      this.state = GameState.READY;
    }
  }

  updateFalling(dt) {
    const h = this.hero;
    h.vy += 0.0022 * dt;
    h.y += h.vy * dt;
    h.angle += dt * 0.004;

    // A too-short bridge tips over past horizontal as the hero falls.
    const b = this.bridge;
    if (b.result === "short") {
      b.fallT += dt;
      b.angle = Math.min(Math.PI / 2, Ease.inQuad(clamp(b.fallT / 420, 0, 1)) * (Math.PI / 2));
    }

    if (h.y > this.LH * 0.4 && !this.splashed) {
      this.splashed = true;
      this.particles.splash(h.x, this.platformY + h.y);
    }
    if (h.y > this.LH * 0.5) this.endRun();
  }

  /** Bank the run: gems, best score, stats, then hand over to the UI. */
  endRun() {
    this.splashed = false;
    this.state = GameState.OVER;
    this.shake.trigger(4, 250);
    AudioSys.gameOver();
    vibrate([40, 60, 80]);

    // Level mode: failing keeps collected gems but doesn't touch the endless best.
    if (this.mode === "level") {
      Storage.addGems(this.gemsRun);
      UI.notifyAchievements(Storage.checkAchievements());
      UI.showLevelFail({ def: this.levelDef, progress: this.crossings });
      return;
    }

    Storage.addGems(this.gemsRun);
    const newBest = Storage.submitScore(this.score);
    UI.notifyAchievements(Storage.checkAchievements());
    UI.showGameOver({
      score: this.score,
      best: Storage.data.best,
      newBest,
      gems: this.gemsRun,
      perfects: this.perfectsRun,
      level: this.level,
    });
  }

  /* ------------------------------------------------------------
     Rendering — everything in logical units; world layer gets
     camera + shake transforms.
     ------------------------------------------------------------ */
  draw(ctx, W) {
    const H = this.LH;
    const theme = Storage.getTheme();

    this.bg.draw(ctx, W, H, this.cameraX, theme);

    ctx.save();
    ctx.translate(-this.cameraX + this.shake.x, this.shake.y);

    this.drawPlatforms(ctx, theme);
    this.drawGem(ctx);
    this.drawBridge(ctx);
    this.drawHero(ctx);
    this.particles.draw(ctx);
    this.popups.draw(ctx);

    ctx.restore();

    // Rain overlays the world but sits under the DOM UI (screen space).
    if (this.state !== GameState.HOME) this.weather.draw(ctx, W, H);

    if (this.state === GameState.READY && this.score === 0 && Storage.data.stats.crossings === 0) {
      this.drawTutorial(ctx, W, H);
    }
  }

  drawPlatforms(ctx, theme) {
    const H = this.LH;
    const py = this.platformY;
    for (const p of this.platforms) {
      const appear = Ease.outBack(clamp(p.appear, 0, 1));
      const yOff = (1 - appear) * 60;
      ctx.save();
      ctx.globalAlpha = clamp(p.appear * 2, 0, 1);
      ctx.translate(0, yOff);

      // Column with soft vertical gradient down off-screen.
      const grad = ctx.createLinearGradient(0, py, 0, H);
      grad.addColorStop(0, theme.platform[0]);
      grad.addColorStop(1, theme.platform[1]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      pathRoundRect(ctx, p.x, py, p.w, H - py + 80, [10, 10, 0, 0]);
      ctx.fill();

      // Bright top lip.
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.beginPath();
      pathRoundRect(ctx, p.x, py, p.w, 6, [10, 10, 2, 2]);
      ctx.fill();

      // Center target marker on the platform being aimed at.
      if (p === this.next && (this.state === GameState.READY || this.state === GameState.GROWING || this.state === GameState.DROPPING)) {
        const cx = p.x + p.w / 2;
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 0.006);
        ctx.fillStyle = `rgba(255,209,102,${0.5 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, py + 3, 3.5 + pulse, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawGem(ctx) {
    const g = this.gem;
    if (!g || g.taken) return;
    const bob = Math.sin(this.time * 0.004 + g.bob) * 4;
    const y = g.y + bob;
    ctx.save();
    ctx.translate(g.x, y);
    ctx.rotate(Math.sin(this.time * 0.002 + g.bob) * 0.2);
    // Diamond with inner facet + glow.
    ctx.shadowColor = "rgba(63,208,255,0.9)";
    ctx.shadowBlur = 12;
    const grad = ctx.createLinearGradient(-8, -10, 8, 10);
    grad.addColorStop(0, "#b8f8ff");
    grad.addColorStop(0.5, "#3fd0ff");
    grad.addColorStop(1, "#7a5cff");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(9, -3); ctx.lineTo(0, 11); ctx.lineTo(-9, -3);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(4.5, -3); ctx.lineTo(0, 1); ctx.lineTo(-4.5, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawBridge(ctx) {
    const b = this.bridge;
    if (b.len <= 0) return; // previous bridge stays visible until a new press
    const style = Storage.getBridge();
    const th = CONFIG.BRIDGE_THICKNESS;

    ctx.save();
    ctx.translate(b.baseX, this.platformY);
    ctx.rotate(b.angle);

    if (style.glow) {
      ctx.shadowColor = rgbaHex(style.colors[0], 0.8);
      ctx.shadowBlur = 10;
    }
    // Colored segments along the length; top surface sits at y=0.
    const segLen = 16;
    const n = Math.ceil(b.len / segLen);
    for (let i = 0; i < n; i++) {
      const x0 = i * segLen;
      const w = Math.min(segLen, b.len - x0);
      ctx.fillStyle = style.colors[i % style.colors.length];
      ctx.beginPath();
      pathRoundRect(ctx, x0, 0, w + 0.5, th, i === n - 1 ? [0, 4, 4, 0] : 0);
      ctx.fill();
    }
    // Shine strip.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, 1, b.len, 2);
    ctx.restore();
  }

  drawHero(ctx) {
    // On the home screen the hero lives in the menu, not in the world.
    if (this.state === GameState.HOME) return;

    const h = this.hero;
    const def = Storage.getChar();
    const py = this.platformY;
    const idleBob = this.state === GameState.READY ? Math.sin(this.time * 0.003) * 1.6 : 0;
    const y = py + h.y + idleBob;

    // Intro drop glides in from the horizontal center of the screen.
    let x = h.x;
    if (this.state === GameState.ENTER && this.introY0 < 0) {
      const frac = clamp(h.y / this.introY0, 0, 1); // 1 at start → 0 at landing
      x += (CONFIG.LOGICAL_W / 2 + this.cameraX - h.x) * frac;
    }

    // Contact shadow only while grounded (grows as the hero approaches).
    if (this.state !== GameState.FALLING) {
      const shScale = this.state === GameState.ENTER ? 1 - clamp(h.y / this.introY0, 0, 1) * 0.55 : 1;
      CharacterArt.drawShadow(ctx, x, py, shScale);
    }

    CharacterArt.draw(ctx, def, x, y, {
      walk: this.state === GameState.WALKING ? h.walk * 14 : 0,
      blink: h.blink,
      squash: h.squash,
      angle: h.angle,
      time: this.time,
    });
  }

  /** First-run hint: pulsing "hold" instruction with a tap ring. */
  drawTutorial(ctx, W, H) {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.004);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = '800 21px ui-rounded, "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = `rgba(255,255,255,${0.75 + 0.25 * pulse})`;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 8;
    ctx.fillText("Press & hold to build a bridge", W / 2, H * 0.42);
    ctx.font = '700 15px ui-rounded, "Segoe UI", system-ui, sans-serif';
    ctx.fillText("Release to drop it — reach the center for PERFECT", W / 2, H * 0.42 + 28);
    // Tap ring
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 - 0.6 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.55, 16 + pulse * 14, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.55, 10, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
