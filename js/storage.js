/* ============================================================
   storage.js — data management: persistent save (localStorage),
   gems, unlocks, high score, achievements state, daily rewards,
   settings. Everything else reads/writes through this module.
   ============================================================ */
"use strict";

const Storage = {
  KEY: "colorbridge_save_v1",
  data: null,

  defaults() {
    return {
      best: 0,
      gems: 0,
      selected: { char: "pip", bridge: "rainbow", theme: "classic" },
      unlocked: { chars: ["pip"], bridges: ["rainbow"], themes: ["classic"] },
      achievements: {},           // id -> true
      levels: {},                 // level id -> best stars (1..3)
      settings: { music: true, sfx: true, vibration: true },
      daily: { lastClaim: "", streak: 0 },
      stats: {
        games: 0, crossings: 0, perfects: 0, bestCombo: 0,
        gemsEarned: 0, unlocks: 0, nightReached: false, maxLevel: 1,
      },
    };
  },

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* corrupt save */ }
    // Deep-merge over defaults so new fields survive version upgrades.
    const d = this.defaults();
    if (saved && typeof saved === "object") {
      for (const k of Object.keys(d)) {
        if (saved[k] === undefined) continue;
        if (typeof d[k] === "object" && d[k] !== null && !Array.isArray(d[k])) {
          Object.assign(d[k], saved[k]);
        } else {
          d[k] = saved[k];
        }
      }
    }
    this.data = d;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* storage full/blocked */ }
  },

  reset() {
    this.data = this.defaults();
    this.save();
  },

  /* ---------- gems ---------- */
  addGems(n) {
    this.data.gems += n;
    this.data.stats.gemsEarned += n;
    this.save();
  },
  spendGems(n) {
    if (this.data.gems < n) return false;
    this.data.gems -= n;
    this.save();
    return true;
  },

  /* ---------- score ---------- */
  /** Returns true if this run set a new best. */
  submitScore(score) {
    if (score > this.data.best) {
      this.data.best = score;
      this.save();
      return true;
    }
    this.save();
    return false;
  },

  /* ---------- unlocks ---------- */
  isUnlocked(type, id) { return this.data.unlocked[type].includes(id); },
  unlock(type, id) {
    if (!this.isUnlocked(type, id)) {
      this.data.unlocked[type].push(id);
      this.data.stats.unlocks++;
      this.save();
    }
  },
  select(type, id) {
    // type: chars/bridges/themes -> selected key char/bridge/theme
    const key = { chars: "char", bridges: "bridge", themes: "theme" }[type];
    this.data.selected[key] = id;
    this.save();
  },

  /* Currently selected definitions (resolved from config data). */
  getChar()   { return CHARACTERS.find(c => c.id === this.data.selected.char)  || CHARACTERS[0]; },
  getBridge() { return BRIDGES.find(b => b.id === this.data.selected.bridge)   || BRIDGES[0]; },
  getTheme()  { return THEMES.find(t => t.id === this.data.selected.theme)     || THEMES[0]; },

  /* ---------- level map ---------- */
  getStars(id) { return this.data.levels[id] || 0; },
  setStars(id, stars) {
    if (stars > this.getStars(id)) {
      this.data.levels[id] = stars;
      this.save();
    }
  },
  totalStars() { return Object.values(this.data.levels).reduce((a, b) => a + b, 0); },
  /** Highest playable level: one past the highest cleared (capped at the end). */
  unlockedLevel() {
    let maxDone = 0;
    for (const k of Object.keys(this.data.levels)) {
      if (this.data.levels[k] > 0) maxDone = Math.max(maxDone, +k);
    }
    return Math.min(maxDone + 1, LEVELS.length);
  },

  /* ---------- daily reward ---------- */
  /** If a reward is claimable today, returns {streak, amount}; else null. */
  dailyAvailable() {
    const today = new Date().toDateString();
    if (this.data.daily.lastClaim === today) return null;
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    const streak = this.data.daily.lastClaim === yesterday ? this.data.daily.streak + 1 : 1;
    return { streak, amount: 20 + Math.min(streak, 7) * 5 };
  },
  claimDaily() {
    const avail = this.dailyAvailable();
    if (!avail) return null;
    this.data.daily.lastClaim = new Date().toDateString();
    this.data.daily.streak = avail.streak;
    this.addGems(avail.amount);
    return avail;
  },

  /* ---------- achievements ---------- */
  /** Evaluate all locked achievements; returns array of newly unlocked defs. */
  checkAchievements() {
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.data.achievements[a.id] && a.cond(this.data)) {
        this.data.achievements[a.id] = true;
        fresh.push(a);
      }
    }
    if (fresh.length) this.save();
    return fresh;
  },
};
