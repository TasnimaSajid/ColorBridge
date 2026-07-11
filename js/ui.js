/* ============================================================
   ui.js — all DOM screens & widgets: home, shop, achievements,
   settings, pause, game over, daily reward, HUD, toasts.
   Talks to Storage for data and Game for state changes.
   ============================================================ */
"use strict";

const UI = {
  els: {},
  currentTab: "chars",
  dailyShown: false,
  overlayUp: false, // true while a blur overlay covers the canvas (freezes rendering)

  $(id) { return document.getElementById(id); },

  init() {
    const ids = [
      "hud", "hud-score", "hud-gem-count", "hud-level", "btn-pause",
      "screen-home", "home-best", "home-gem-count", "home-char",
      "home-streak", "home-streak-count", "home-perfects", "home-crossings",
      "home-stage", "home-char-name",
      "btn-play", "btn-endless", "btn-shop", "btn-achievements", "btn-settings",
      "screen-levels", "level-grid", "levels-stars",
      "screen-levelcomplete", "lc-title", "lc-gems", "lc-perfects",
      "lc-star-1", "lc-star-2", "lc-star-3",
      "btn-next-level", "btn-replay-level", "btn-lc-map",
      "screen-levelfail", "lf-title", "lf-progress", "btn-retry-level", "btn-lf-map",
      "screen-shop", "shop-grid", "shop-gem-count",
      "screen-achievements", "ach-list", "ach-progress",
      "screen-settings", "toggle-music", "toggle-sfx", "toggle-vibration", "btn-reset-save",
      "screen-pause", "btn-resume", "btn-restart", "btn-quit",
      "screen-gameover", "go-score", "go-best", "go-gems", "go-perfects", "go-level", "go-newbest",
      "btn-retry", "btn-go-home",
      "modal-daily", "daily-streak", "daily-amount", "btn-claim-daily",
      "toast-holder",
    ];
    for (const id of ids) this.els[id] = this.$(id);

    this.bind();
    this.syncSettings();
    this.showHome();
  },

  /* ---------- wiring ---------- */
  bind() {
    const click = (id, fn) => this.els[id].addEventListener("click", (e) => {
      e.stopPropagation();
      AudioSys.init();
      AudioSys.click();
      fn();
    });

    click("btn-play", () => this.showLevels());
    click("btn-endless", () => this.startGame());
    click("home-stage", () => { this.currentTab = "chars"; this.showShop(); });
    click("btn-retry", () => this.startGame());
    click("btn-restart", () => {
      if (game.mode === "level" && this.activeLevel) this.startLevel(this.activeLevel);
      else this.startGame();
    });
    click("btn-next-level", () => {
      const next = LEVELS[this.activeLevel ? this.activeLevel.id : 0]; // id is 1-based
      if (next) this.startLevel(next); else this.showLevels();
    });
    click("btn-replay-level", () => this.startLevel(this.activeLevel));
    click("btn-retry-level", () => this.startLevel(this.activeLevel));
    click("btn-lc-map", () => this.showLevels());
    click("btn-lf-map", () => this.showLevels());
    click("btn-shop", () => this.showShop());
    click("btn-achievements", () => this.showAchievements());
    click("btn-settings", () => this.showSettings());
    click("btn-pause", () => this.pause());
    click("btn-resume", () => this.resume());
    click("btn-quit", () => this.showHome());
    click("btn-go-home", () => this.showHome());
    click("btn-claim-daily", () => this.claimDaily());
    click("btn-reset-save", () => {
      if (confirm("Reset ALL progress? Gems, unlocks and records will be lost.")) {
        Storage.reset();
        this.syncSettings();
        this.showHome();
      }
    });

    // Back buttons on panel screens.
    document.querySelectorAll(".btn-back").forEach(b =>
      b.addEventListener("click", () => { AudioSys.click(); this.showHome(); }));

    // Shop tabs.
    document.querySelectorAll(".tab").forEach(t =>
      t.addEventListener("click", () => {
        AudioSys.click();
        document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        this.currentTab = t.dataset.tab;
        this.renderShop();
      }));

    // Settings toggles.
    const toggle = (id, key) => this.els[id].addEventListener("change", (e) => {
      Storage.data.settings[key] = e.target.checked;
      Storage.save();
      AudioSys.init();
      AudioSys.applySettings();
      AudioSys.click();
      if (key === "vibration" && e.target.checked) vibrate(20);
    });
    toggle("toggle-music", "music");
    toggle("toggle-sfx", "sfx");
    toggle("toggle-vibration", "vibration");
  },

  hideAll() {
    ["screen-home", "screen-shop", "screen-achievements", "screen-settings",
     "screen-pause", "screen-gameover", "modal-daily", "hud",
     "screen-levels", "screen-levelcomplete", "screen-levelfail"]
      .forEach(id => this.els[id].classList.add("hidden"));
  },

  /* ---------- screens ---------- */
  showHome() {
    this.hideAll();
    this.overlayUp = false;
    game.goHome();
    this.els["screen-home"].classList.remove("hidden");
    this.els["home-best"].textContent = Storage.data.best;
    this.els["home-gem-count"].textContent = Storage.data.gems;
    this.els["home-perfects"].textContent = Storage.data.stats.perfects;
    this.els["home-crossings"].textContent = Storage.data.stats.crossings;
    this.els["home-char-name"].textContent = Storage.getChar().name;
    // Daily streak chip (only once a streak exists)
    const streak = Storage.data.daily.streak;
    this.els["home-streak"].classList.toggle("hidden", streak < 1);
    this.els["home-streak-count"].textContent = `Day ${streak}`;
    this.renderHomeChar();

    // Daily reward: offer once per app session, if claimable.
    if (!this.dailyShown) {
      const avail = Storage.dailyAvailable();
      if (avail) {
        this.dailyShown = true;
        this.els["daily-streak"].textContent = `Day ${avail.streak} streak`;
        this.els["daily-amount"].textContent = `+${avail.amount}`;
        this.els["modal-daily"].classList.remove("hidden");
        this.overlayUp = true;
      }
    }
  },

  claimDaily() {
    const got = Storage.claimDaily();
    this.els["modal-daily"].classList.add("hidden");
    this.overlayUp = false;
    if (got) {
      AudioSys.reward();
      vibrate([20, 40, 20]);
      this.toast("🎁", `+${got.amount} gems`, `Day ${got.streak} streak`);
      this.els["home-gem-count"].textContent = Storage.data.gems;
      this.els["home-streak"].classList.remove("hidden");
      this.els["home-streak-count"].textContent = `Day ${got.streak}`;
      this.notifyAchievements(Storage.checkAchievements());
    }
  },

  startGame() {
    this.hideAll();
    this.overlayUp = false;
    AudioSys.init();
    this.els["hud"].classList.remove("hidden");
    this.setLevel(1);
    game.startRun();
  },

  setLevel(lv) {
    this.els["hud-level"].textContent = `LEVEL ${lv}`;
  },

  /* ---------- level map ---------- */
  showLevels() {
    this.hideAll();
    this.overlayUp = false;
    game.goHome(); // idle scene behind the map; also banks a quit mid-run
    this.els["screen-levels"].classList.remove("hidden");
    this.els["levels-stars"].textContent = `★ ${Storage.totalStars()}/${LEVELS.length * 3}`;

    const grid = this.els["level-grid"];
    grid.innerHTML = "";
    const unlocked = Storage.unlockedLevel();
    for (const def of LEVELS) {
      const stars = Storage.getStars(def.id);
      const node = document.createElement("div");
      node.className = "level-node";
      if (def.id > unlocked) {
        node.classList.add("locked");
        node.textContent = "🔒";
      } else {
        node.innerHTML =
          `<div>${def.id}</div>` +
          `<div class="node-stars">` +
          [1, 2, 3].map(i => `<span class="${i <= stars ? "" : "off"}">★</span>`).join("") +
          `</div>`;
        if (stars > 0) node.classList.add("done");
        if (def.id === unlocked) node.classList.add("current");
        node.addEventListener("click", () => {
          AudioSys.init();
          AudioSys.click();
          this.startLevel(def);
        });
      }
      grid.appendChild(node);
    }
  },

  startLevel(def) {
    if (!def) { this.showLevels(); return; }
    this.activeLevel = def;
    this.hideAll();
    this.overlayUp = false;
    AudioSys.init();
    this.els["hud"].classList.remove("hidden");
    this.setLevel(def.id);
    game.startLevel(def);
  },

  showLevelComplete({ def, stars, gems, perfects }) {
    this.overlayUp = true;
    this.els["hud"].classList.add("hidden");
    this.els["lc-title"].textContent = `Level ${def.id} clear!`;
    for (let i = 1; i <= 3; i++) {
      const el = this.els[`lc-star-${i}`];
      el.classList.remove("earned");
      // Force a reflow so the pop animation replays on repeated clears.
      void el.offsetWidth;
      el.classList.toggle("earned", i <= stars);
    }
    this.els["lc-gems"].textContent = `+${gems}`;
    this.els["lc-perfects"].textContent = perfects;
    this.els["btn-next-level"].classList.toggle("hidden", def.id >= LEVELS.length);
    this.els["screen-levelcomplete"].classList.remove("hidden");
  },

  showLevelFail({ def, progress }) {
    this.overlayUp = true;
    this.els["hud"].classList.add("hidden");
    this.els["lf-title"].textContent = `Level ${def.id}`;
    this.els["lf-progress"].textContent = `${progress}/${def.goal} bridges crossed`;
    this.els["screen-levelfail"].classList.remove("hidden");
  },

  pause() {
    if (game.state === GameState.HOME || game.state === GameState.OVER) return;
    game.pausedFrom = game.state;
    game.state = "paused";
    this.overlayUp = true;
    this.els["screen-pause"].classList.remove("hidden");
  },

  resume() {
    if (game.state !== "paused") return;
    game.state = game.pausedFrom || GameState.READY;
    this.overlayUp = false;
    this.els["screen-pause"].classList.add("hidden");
  },

  showGameOver({ score, best, newBest, gems, perfects, level }) {
    this.overlayUp = true;
    this.els["hud"].classList.add("hidden");
    this.els["go-score"].textContent = score;
    this.els["go-best"].textContent = best;
    this.els["go-gems"].textContent = `+${gems}`;
    this.els["go-perfects"].textContent = perfects;
    this.els["go-level"].textContent = level || 1;
    this.els["go-newbest"].classList.toggle("hidden", !newBest);
    this.els["screen-gameover"].classList.remove("hidden");
  },

  updateHUD(score, gems) {
    this.els["hud-score"].textContent = score;
    this.els["hud-gem-count"].textContent = gems;
  },

  /* ---------- home character preview ---------- */
  renderHomeChar() {
    const cv = this.els["home-char"];
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(0, 0);
    CharacterArt.drawShadow(ctx, 70, 112, 1.6);
    CharacterArt.draw(ctx, Storage.getChar(), 70, 112, { scale: 1.6 });
    ctx.restore();
  },

  /* ---------- shop ---------- */
  showShop() {
    this.hideAll();
    this.els["screen-shop"].classList.remove("hidden");
    this.els["shop-gem-count"].textContent = Storage.data.gems;
    // Keep the tab highlight in sync (the shop can open on any tab).
    document.querySelectorAll(".tab").forEach(t =>
      t.classList.toggle("active", t.dataset.tab === this.currentTab));
    this.renderShop();
  },

  renderShop() {
    const grid = this.els["shop-grid"];
    grid.innerHTML = "";
    const tab = this.currentTab;
    const items = tab === "chars" ? CHARACTERS : tab === "bridges" ? BRIDGES : THEMES;
    const selKey = { chars: "char", bridges: "bridge", themes: "theme" }[tab];

    for (const item of items) {
      const owned = Storage.isUnlocked(tab, item.id);
      const selected = Storage.data.selected[selKey] === item.id;

      const card = document.createElement("div");
      card.className = "shop-card" + (selected ? " selected" : "") + (owned ? "" : " locked");

      // Preview
      const prev = document.createElement("div");
      prev.className = "shop-preview";
      if (tab === "chars") {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 84;
        const c = cv.getContext("2d");
        CharacterArt.drawShadow(c, 42, 66, 1.1);
        CharacterArt.draw(c, item, 42, 66, { scale: 1.1 });
        prev.appendChild(cv);
      } else if (tab === "bridges") {
        const strip = document.createElement("div");
        strip.className = "bridge-preview";
        const stops = item.colors.map((c, i) =>
          `${c} ${(i / item.colors.length) * 100}% ${((i + 1) / item.colors.length) * 100}%`).join(", ");
        strip.style.background = `linear-gradient(90deg, ${stops})`;
        if (item.glow) strip.style.boxShadow = `0 0 14px ${item.colors[0]}`;
        prev.appendChild(strip);
      } else {
        const sw = document.createElement("div");
        sw.className = "theme-preview";
        const day = item.phases[1].sky, night = item.phases[3].sky;
        sw.style.background = `linear-gradient(160deg, ${day[0]} 0%, ${day[2]} 48%, ${night[1]} 52%, ${night[0]} 100%)`;
        prev.appendChild(sw);
      }
      card.appendChild(prev);

      const name = document.createElement("div");
      name.className = "shop-name";
      name.textContent = item.name;
      card.appendChild(name);

      const price = document.createElement("div");
      price.className = "shop-price";
      if (selected) { price.classList.add("selected-label"); price.textContent = "✓ Selected"; }
      else if (owned) { price.classList.add("owned"); price.textContent = "Owned"; }
      else {
        price.innerHTML = `<span class="gem-icon"></span> ${item.cost}`;
        if (Storage.data.gems < item.cost) price.classList.add("cant-afford");
      }
      card.appendChild(price);

      card.addEventListener("click", () => this.shopTap(tab, item, owned));
      grid.appendChild(card);
    }
  },

  shopTap(tab, item, owned) {
    AudioSys.init();
    if (owned) {
      Storage.select(tab, item.id);
      AudioSys.click();
    } else if (Storage.spendGems(item.cost)) {
      Storage.unlock(tab, item.id);
      Storage.select(tab, item.id);
      AudioSys.purchase();
      vibrate([15, 30, 15]);
      this.toast("🛍️", `${item.name} unlocked!`, "");
      this.notifyAchievements(Storage.checkAchievements());
    } else {
      AudioSys.click();
      this.toast("💎", "Not enough gems", "collect gems in-game");
    }
    this.els["shop-gem-count"].textContent = Storage.data.gems;
    this.renderShop();
  },

  /* ---------- achievements ---------- */
  showAchievements() {
    this.hideAll();
    this.els["screen-achievements"].classList.remove("hidden");
    const list = this.els["ach-list"];
    list.innerHTML = "";
    let done = 0;
    for (const a of ACHIEVEMENTS) {
      const got = !!Storage.data.achievements[a.id];
      if (got) done++;
      const row = document.createElement("div");
      row.className = "ach-row" + (got ? " done" : "");
      row.innerHTML =
        `<div class="ach-icon">${a.icon}</div>
         <div class="ach-info">
           <div class="ach-name">${a.name}</div>
           <div class="ach-desc">${a.desc}</div>
         </div>` + (got ? '<div class="ach-check">✓</div>' : "");
      list.appendChild(row);
    }
    this.els["ach-progress"].textContent = `${done}/${ACHIEVEMENTS.length}`;
  },

  /** Toast each freshly unlocked achievement (called from game & shop). */
  notifyAchievements(fresh) {
    for (const a of fresh) {
      AudioSys.achievement();
      vibrate([20, 30, 20]);
      this.toast(a.icon, a.name, "Achievement unlocked");
    }
  },

  /* ---------- settings ---------- */
  showSettings() {
    this.hideAll();
    this.els["screen-settings"].classList.remove("hidden");
    this.syncSettings();
  },

  syncSettings() {
    const s = Storage.data.settings;
    this.els["toggle-music"].checked = s.music;
    this.els["toggle-sfx"].checked = s.sfx;
    this.els["toggle-vibration"].checked = s.vibration;
  },

  /* ---------- toasts ---------- */
  toast(icon, title, sub) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="t-icon">${icon}</span><span>${title}</span>` +
      (sub ? `<span class="t-sub">${sub}</span>` : "");
    this.els["toast-holder"].appendChild(el);
    setTimeout(() => el.remove(), 3200);
  },
};
