/* ============================================================
   main.js — bootstrap: canvas sizing (DPR-aware), the game
   loop, and touch/pointer/keyboard input routing.
   ============================================================ */
"use strict";

let game; // global instance shared with ui.js

(function boot() {
  Storage.load();

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  game = new Game();
  UI.init();

  /* ---------- responsive canvas: logical width fixed at 480 ---------- */
  let viewScale = 1;
  function resize() {
    const holder = document.getElementById("app");
    const cssW = holder.clientWidth;
    const cssH = holder.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for perf
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    viewScale = (cssW / CONFIG.LOGICAL_W) * dpr;
    game.LH = cssH / (cssW / CONFIG.LOGICAL_W); // logical height
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  resize();

  /* ---------- input: press anywhere on the canvas ---------- */
  function pressStart(e) {
    if (e.target !== canvas) return; // buttons handle themselves
    e.preventDefault();
    AudioSys.init();
    game.press();
  }
  function pressEnd() { game.release(); }

  canvas.addEventListener("pointerdown", pressStart);
  window.addEventListener("pointerup", pressEnd);
  window.addEventListener("pointercancel", pressEnd);
  // Desktop convenience: space bar plays too.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) { AudioSys.init(); game.press(); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") game.release(); });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ---------- auto-pause when the app goes to background ---------- */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (game.state !== GameState.HOME && game.state !== GameState.OVER && game.state !== "paused") {
        UI.pause();
      }
      if (AudioSys.ctx) AudioSys.ctx.suspend();
    } else if (AudioSys.ctx) {
      AudioSys.ctx.resume();
    }
  });

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(now) {
    // Clamp dt so background tabs / hiccups can't teleport the physics.
    const dt = Math.min(now - last, 50);
    last = now;

    // Freeze the canvas under full-screen blur overlays (pause/game-over/daily):
    // a static backdrop lets the browser compute the blur once, not per frame.
    if (game.state !== "paused" && !UI.overlayUp) game.update(dt);

    if (!UI.overlayUp) {
      ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
      game.draw(ctx, CONFIG.LOGICAL_W);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
