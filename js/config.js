/* ============================================================
   config.js — all game data & tuning in one place:
   gameplay constants, difficulty curve, unlockable characters,
   bridge styles, background theme packs, achievements.
   ============================================================ */
"use strict";

const CONFIG = {
  LOGICAL_W: 480,          // logical canvas width; height derives from aspect
  PLATFORM_Y_RATIO: 0.72,  // platform surface height as fraction of screen
  ANCHOR_X: 110,           // where the hero stands on screen (from left)
  CHAR_EDGE_OFFSET: 20,    // hero's distance from a platform's right edge
  BRIDGE_THICKNESS: 10,
  PERFECT_WINDOW: 8,       // +/- px from platform center that counts as perfect
  GROW_SPEED_BASE: 0.30,   // bridge growth px/ms
  GROW_SPEED_PER_SCORE: 0.0022,
  GROW_SPEED_MAX: 0.52,
  WALK_SPEED: 0.24,        // hero walk px/ms
  DROP_TIME: 380,          // ms for the bridge to fall forward
  SHIFT_TIME: 460,         // ms for the camera to scroll to the next platform
  GEM_CHANCE: 0.34,        // chance a gap contains a collectible gem
  THEME_CYCLE: 8,          // crossings per background phase (sunrise→day→…)
  MAX_COMBO_BONUS: 4,      // perfect-streak bonus cap

  /* ---- Levels: every LEVEL_SIZE crossings advances one level ---- */
  LEVEL_SIZE: 8,           // kept equal to THEME_CYCLE so each level has its own sky
  MOVING_FROM_LEVEL: 4,    // moving target platforms appear from this level
  LEVEL_NAMES: ["Sunrise", "Daylight", "Sunset", "Midnight"], // cycles with the sky

  levelFor(crossings) { return Math.floor(crossings / this.LEVEL_SIZE) + 1; },

  /** Chance that a newly spawned platform slides side-to-side. */
  movingChance(level) {
    if (level < this.MOVING_FROM_LEVEL) return 0;
    return Math.min(0.2 + (level - this.MOVING_FROM_LEVEL) * 0.12, 0.65);
  },

  /** Difficulty curve: gaps widen and platforms narrow as score grows. */
  difficulty(score) {
    const t = clamp(score / 60, 0, 1);
    return {
      gapMin: lerp(70, 115, t),
      gapMax: lerp(135, 225, t),
      widthMin: lerp(72, 36, t),
      widthMax: lerp(115, 62, t),
    };
  },
};

/* ------------------------------------------------------------
   Level map — 20 discrete levels. Each has a bridge goal, its
   own difficulty band, a fixed sky phase, and (later) moving
   towers. Stars: 1 = clear, 2 = ⅓ perfect landings, 3 = ⅔.
   ------------------------------------------------------------ */
const LEVELS = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const t = Math.min(1, n / 16); // difficulty ramp, maxed by level 16
  return {
    id: n,
    goal: 28 + n * 2,                               // bridges to cross: 30 → 68 (rises each level)
    gapMin: lerp(70, 118, t),  gapMax: lerp(130, 210, t),
    widthMin: lerp(76, 40, t), widthMax: lerp(115, 66, t),
    movingChance: n >= 8 ? Math.min(0.15 + (n - 8) * 0.05, 0.6) : 0,
    phase: (n - 1) % 4,                             // sunrise/day/sunset/night
  };
});

/* ------------------------------------------------------------
   Characters — drawn procedurally in character.js by `kind`.
   ------------------------------------------------------------ */
const CHARACTERS = [
  { id: "pip",   name: "Pip",   cost: 0,   kind: "blob",  body: "#7ce3b1", body2: "#3fbf8a", accent: "#2e8f66" },
  { id: "coco",  name: "Coco",  cost: 120, kind: "cat",   body: "#ffb35c", body2: "#f28638", accent: "#c65f1e" },
  { id: "sunny", name: "Sunny", cost: 160, kind: "chick", body: "#ffe066", body2: "#ffc233", accent: "#ff9f1c" },
  { id: "boo",   name: "Boo",   cost: 220, kind: "ghost", body: "#cdb4ff", body2: "#a07df2", accent: "#7c53d6" },
  { id: "bolt",  name: "Bolt",  cost: 300, kind: "robot", body: "#9fd8ff", body2: "#5fa8e6", accent: "#3c7fc0" },
];

/* ------------------------------------------------------------
   Bridge styles — segment color palettes.
   ------------------------------------------------------------ */
const BRIDGES = [
  { id: "rainbow", name: "Rainbow", cost: 0,   colors: ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#9775fa"] },
  { id: "candy",   name: "Candy",   cost: 100, colors: ["#ff8fab", "#fff0f3"] },
  { id: "ocean",   name: "Ocean",   cost: 150, colors: ["#0096c7", "#48cae4", "#90e0ef"] },
  { id: "neon",    name: "Neon",    cost: 250, colors: ["#00f5d4", "#f15bb5", "#fee440"], glow: true },
  { id: "gold",    name: "Royal",   cost: 400, colors: ["#f9c74f", "#f9844a", "#ffe066"], glow: true },
];

/* ------------------------------------------------------------
   Theme packs — each has 4 phases (sunrise, day, sunset, night)
   that the background cycles through as the run progresses.
   sky: 3-stop gradient · hills: 2 parallax layers · sun/star info.
   ------------------------------------------------------------ */
const THEMES = [
  {
    id: "classic", name: "Classic", cost: 0, scenery: "pines",
    phases: [
      { sky: ["#2b2d5e", "#e96e8e", "#ffc48c"], sun: "#ffd9a0", hills: ["#6a4c93", "#8d5a97"], stars: 0.2, clouds: "#ffd7e0" },
      { sky: ["#4fb8e6", "#a4e2f5", "#e8f8ff"], sun: "#fff3b0", hills: ["#5cb87e", "#8fd9a8"], stars: 0,   clouds: "#ffffff" },
      { sky: ["#3b2a5a", "#c94b7c", "#ff9e6d"], sun: "#ffb26b", hills: ["#553a75", "#7a4d8c"], stars: 0.3, clouds: "#ffc4a3" },
      { sky: ["#0c1033", "#1c2258", "#33396e"], sun: "#f3f0da", hills: ["#232a52", "#2f3763"], stars: 1,   clouds: "#5a628f", moon: true },
    ],
    platform: ["#3a3f7a", "#23264f"],
  },
  {
    id: "pastel", name: "Pastel Dream", cost: 300, scenery: "pines",
    phases: [
      { sky: ["#b8a9e8", "#f7c8e0", "#fff2cc"], sun: "#fff0b3", hills: ["#c497d6", "#e0b3e6"], stars: 0.1, clouds: "#ffffff" },
      { sky: ["#a8dcf5", "#d4f0f7", "#fdf6e3"], sun: "#fff7cc", hills: ["#a3e4c1", "#cdf2dd"], stars: 0,   clouds: "#ffffff" },
      { sky: ["#9a8fd0", "#f3a6c8", "#ffd9b3"], sun: "#ffd9a8", hills: ["#b088c9", "#d3a8de"], stars: 0.2, clouds: "#ffe3ee" },
      { sky: ["#2e2a55", "#4d4585", "#7a6bb5"], sun: "#fdf3d8", hills: ["#413a70", "#565096"], stars: 1,   clouds: "#8f86c4", moon: true },
    ],
    platform: ["#8f86c4", "#5c548f"],
  },
  {
    id: "desert", name: "Desert Drift", cost: 350, scenery: "cacti",
    phases: [
      { sky: ["#5b2a86", "#d16ba5", "#ffd29d"], sun: "#ffe3b3", hills: ["#8a4f7d", "#c96f4a"], stars: 0.2, clouds: "#ffd9c2" },
      { sky: ["#6ec6e6", "#ffe8c2", "#ffd9a3"], sun: "#fffbe0", hills: ["#c96f4a", "#e08d5a"], stars: 0,   clouds: "#fff6ea" },
      { sky: ["#4a1e5f", "#c4416b", "#ff8f5c"], sun: "#ffc46b", hills: ["#7d3b5e", "#a34d3f"], stars: 0.3, clouds: "#ffb59e" },
      { sky: ["#150b2e", "#2a1a52", "#4a2f66"], sun: "#f5ead2", hills: ["#221240", "#332052"], stars: 1,   clouds: "#4a3a70", moon: true },
    ],
    platform: ["#a3684a", "#5c3a26"],
  },
  {
    id: "neonNight", name: "Neon City", cost: 450, scenery: "city",
    phases: [
      { sky: ["#12063a", "#5e1a78", "#ff4d94"], sun: "#ff8ac2", hills: ["#31135e", "#4a1f80"], stars: 0.6, clouds: "#7c3aa8" },
      { sky: ["#0b1a4d", "#153a8f", "#00c2d1"], sun: "#8ef7ff", hills: ["#12297a", "#1d3fa8"], stars: 0.3, clouds: "#2f6bd6" },
      { sky: ["#1a0533", "#8f1b5f", "#ff7847"], sun: "#ffc46b", hills: ["#3d0f52", "#5c1d70"], stars: 0.5, clouds: "#a8408f" },
      { sky: ["#03010f", "#120b33", "#2a1a5e"], sun: "#d8f5ff", hills: ["#0d0a26", "#181343"], stars: 1,   clouds: "#292058", moon: true },
    ],
    platform: ["#251a56", "#120b33"],
  },
];

/* ------------------------------------------------------------
   Achievements — cond() runs against (save) after every event.
   run-* fields live in save.run (reset each game).
   ------------------------------------------------------------ */
const ACHIEVEMENTS = [
  { id: "firstBridge", icon: "🌉", name: "Baby Steps",     desc: "Cross your first bridge",          cond: s => s.stats.crossings >= 1 },
  { id: "bullseye",    icon: "🎯", name: "Bullseye",       desc: "Land a perfect bridge",            cond: s => s.stats.perfects >= 1 },
  { id: "combo3",      icon: "🔥", name: "Hat Trick",      desc: "3 perfect bridges in a row",       cond: s => s.stats.bestCombo >= 3 },
  { id: "combo6",      icon: "⚡", name: "Unstoppable",    desc: "6 perfect bridges in a row",       cond: s => s.stats.bestCombo >= 6 },
  { id: "score10",     icon: "⭐", name: "Warming Up",     desc: "Reach a score of 10",              cond: s => s.best >= 10 },
  { id: "score25",     icon: "🌟", name: "Rising Star",    desc: "Reach a score of 25",              cond: s => s.best >= 25 },
  { id: "score50",     icon: "🏆", name: "Half Century",   desc: "Reach a score of 50",              cond: s => s.best >= 50 },
  { id: "score100",    icon: "👑", name: "Century Club",   desc: "Reach a score of 100",             cond: s => s.best >= 100 },
  { id: "gems50",      icon: "💎", name: "Shiny!",         desc: "Collect 50 gems in total",         cond: s => s.stats.gemsEarned >= 50 },
  { id: "gems250",     icon: "💰", name: "Treasure Hunter",desc: "Collect 250 gems in total",        cond: s => s.stats.gemsEarned >= 250 },
  { id: "shopper",     icon: "🛍️", name: "New Look",       desc: "Unlock anything in the shop",      cond: s => s.stats.unlocks >= 1 },
  { id: "nightOwl",    icon: "🌙", name: "Night Owl",      desc: "Reach the night sky in one run",   cond: s => s.stats.nightReached },
  { id: "level3",      icon: "🚩", name: "Explorer",       desc: "Reach level 3",                    cond: s => s.stats.maxLevel >= 3 },
  { id: "level5",      icon: "🗺️", name: "Adventurer",     desc: "Reach level 5",                    cond: s => s.stats.maxLevel >= 5 },
  { id: "clear10",     icon: "🏔️", name: "Trailblazer",    desc: "Clear level 10 on the map",        cond: s => (s.levels[10] || 0) >= 1 },
  { id: "stars15",     icon: "✨", name: "Star Gazer",     desc: "Earn 15 stars on the level map",   cond: s => Object.values(s.levels).reduce((a, b) => a + b, 0) >= 15 },
  { id: "veteran",     icon: "🎮", name: "Dedicated",      desc: "Play 25 games",                    cond: s => s.stats.games >= 25 },
];
