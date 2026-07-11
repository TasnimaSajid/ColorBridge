/* ============================================================
   audio.js — all sound is synthesized live with WebAudio, so
   the game ships zero audio assets and everything is original.
   - SFX: short envelope-shaped oscillator tones
   - Music: gentle generative pad chords + pentatonic plucks
   ============================================================ */
"use strict";

const AudioSys = {
  ctx: null,
  master: null,
  sfxGain: null,
  musicGain: null,
  growOsc: null,       // looping riser while the bridge grows
  growGainNode: null,
  musicTimer: null,
  nextChordAt: 0,
  nextPluckAt: 0,
  chordIdx: 0,

  /* Warm, calm progression (midi notes): Cmaj9 / Am7 / Fmaj7 / Gsus */
  CHORDS: [
    [48, 55, 62, 64],
    [45, 52, 60, 64],
    [41, 48, 57, 60],
    [43, 50, 60, 62],
  ],
  PENTA: [60, 62, 64, 67, 69, 72, 74, 76], // C major pentatonic for plucks

  midi(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  /** Must be called from a user gesture (autoplay policy). Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);

    this.applySettings();
    this.startMusic();
  },

  applySettings() {
    if (!this.ctx) return;
    const s = Storage.data.settings;
    this.sfxGain.gain.value = s.sfx ? 1 : 0;
    // Music fades rather than hard-cutting.
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(s.music ? 0.5 : 0, this.ctx.currentTime, 0.4);
  },

  /* ------------------------------------------------------------
     Core tone helper: one oscillator with an ADSR-ish envelope.
     ------------------------------------------------------------ */
  tone({ freq = 440, endFreq = null, dur = 0.2, type = "sine", vol = 0.3, attack = 0.005, when = 0, dest = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  /* Soft filtered noise burst (thuds, whooshes). */
  noise({ dur = 0.15, vol = 0.25, freq = 800, when = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t0);
  },

  /* ------------------------------------------------------------
     Named game SFX
     ------------------------------------------------------------ */
  click()  { this.tone({ freq: 620, endFreq: 880, dur: 0.08, type: "sine", vol: 0.22 }); },

  /** Continuous riser while holding — pitch follows bridge length. */
  growStart() {
    if (!this.ctx || this.growOsc) return;
    this.growOsc = this.ctx.createOscillator();
    this.growGainNode = this.ctx.createGain();
    this.growOsc.type = "triangle";
    this.growOsc.frequency.value = 180;
    this.growGainNode.gain.value = 0;
    this.growGainNode.gain.setTargetAtTime(0.14, this.ctx.currentTime, 0.03);
    this.growOsc.connect(this.growGainNode);
    this.growGainNode.connect(this.sfxGain);
    this.growOsc.start();
  },
  growPitch(len) {
    // Guard against a non-finite length (e.g. before the canvas has sized),
    // which would throw when assigned to an AudioParam.
    if (this.growOsc && isFinite(len)) this.growOsc.frequency.value = 180 + len * 1.4;
  },
  growStop() {
    if (!this.growOsc) return;
    const t = this.ctx.currentTime;
    this.growGainNode.gain.setTargetAtTime(0, t, 0.02);
    this.growOsc.stop(t + 0.1);
    this.growOsc = null;
    this.growGainNode = null;
  },

  drop()    { this.noise({ dur: 0.22, vol: 0.2, freq: 500 }); },
  land()    { this.noise({ dur: 0.12, vol: 0.3, freq: 300 }); this.tone({ freq: 130, endFreq: 70, dur: 0.15, type: "sine", vol: 0.35 }); },
  perfect() {
    this.tone({ freq: this.midi(84), dur: 0.15, type: "sine",     vol: 0.3 });
    this.tone({ freq: this.midi(88), dur: 0.20, type: "sine",     vol: 0.3, when: 0.07 });
    this.tone({ freq: this.midi(91), dur: 0.35, type: "triangle", vol: 0.3, when: 0.14 });
  },
  gem() {
    this.tone({ freq: this.midi(88), dur: 0.10, type: "sine", vol: 0.28 });
    this.tone({ freq: this.midi(93), dur: 0.22, type: "sine", vol: 0.28, when: 0.05 });
  },
  step(i)   { this.tone({ freq: i % 2 ? 340 : 300, dur: 0.045, type: "sine", vol: 0.07 }); },
  fall()    { this.tone({ freq: 700, endFreq: 90, dur: 0.7, type: "sawtooth", vol: 0.12 }); this.noise({ dur: 0.5, vol: 0.12, freq: 900 }); },
  gameOver(){ this.tone({ freq: this.midi(64), dur: 0.3, type: "triangle", vol: 0.25 }); this.tone({ freq: this.midi(60), dur: 0.4, type: "triangle", vol: 0.25, when: 0.18 }); this.tone({ freq: this.midi(55), dur: 0.6, type: "triangle", vol: 0.25, when: 0.36 }); },
  achievement() {
    [79, 84, 88, 91].forEach((n, i) => this.tone({ freq: this.midi(n), dur: 0.22, type: "triangle", vol: 0.24, when: i * 0.08 }));
  },
  levelUp() {
    [72, 76, 79, 84].forEach((n, i) => this.tone({ freq: this.midi(n), dur: 0.18, type: "sine", vol: 0.26, when: i * 0.07 }));
  },
  purchase() { [76, 83, 88].forEach((n, i) => this.tone({ freq: this.midi(n), dur: 0.16, type: "sine", vol: 0.26, when: i * 0.06 })); },
  reward()   { this.achievement(); },

  /* ------------------------------------------------------------
     Generative background music: a slow chord pad every 4 beats
     plus sparse pentatonic plucks. Scheduled ahead of time.
     ------------------------------------------------------------ */
  startMusic() {
    if (this.musicTimer) return;
    this.nextChordAt = this.ctx.currentTime + 0.2;
    this.nextPluckAt = this.ctx.currentTime + 2;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 250);
  },

  scheduleMusic() {
    if (!this.ctx || Storage.data.settings.music === false) {
      // Keep clock moving so music resumes in sync when re-enabled.
      const now = this.ctx ? this.ctx.currentTime : 0;
      if (this.nextChordAt < now) this.nextChordAt = now + 0.3;
      if (this.nextPluckAt < now) this.nextPluckAt = now + 1;
      return;
    }
    const ahead = this.ctx.currentTime + 0.6;

    while (this.nextChordAt < ahead) {
      const chord = this.CHORDS[this.chordIdx % this.CHORDS.length];
      const when = this.nextChordAt - this.ctx.currentTime;
      for (const note of chord) {
        this.padVoice(this.midi(note), when, 4.4);
      }
      this.chordIdx++;
      this.nextChordAt += 4.0;
    }
    while (this.nextPluckAt < ahead) {
      const when = this.nextPluckAt - this.ctx.currentTime;
      this.tone({ freq: this.midi(pick(this.PENTA)), dur: 0.9, type: "sine", vol: 0.05, attack: 0.01, when, dest: this.musicGain });
      this.nextPluckAt += rand(0.9, 2.4);
    }
  },

  /** One soft pad voice: slow attack/release triangle. */
  padVoice(freq, when, dur) {
    const t0 = this.ctx.currentTime + Math.max(when, 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = rand(-4, 4);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.035, t0 + 1.2);
    g.gain.setValueAtTime(0.035, t0 + dur - 1.4);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
  },
};
