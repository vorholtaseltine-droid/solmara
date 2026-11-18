// Solmara sound: every effect and the music loop are synthesized with
// WebAudio, so the game ships no audio files at all. Nothing plays until
// the first user gesture (the start click), as browsers require.
(function () {
  'use strict';

  var G = window.SOLMARA;

  function SoundFX() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = 0;
    this.musicGain = null;
    this.musicStep = 0;
    this.musicNext = 0;
    this.noiseBuf = null;
  }

  SoundFX.prototype.init = function () {
    if (this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Shared white-noise buffer for gunshots, crashes and hi-hats.
      var len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startEngine();
      this.startSiren();
      this.startMusic();
    } catch (e) {
      this.ctx = null;
    }
  };

  SoundFX.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  SoundFX.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  };

  SoundFX.prototype.now = function () {
    return this.ctx ? this.ctx.currentTime : 0;
  };

  // ---- Engine: two detuned saws through a lowpass, pitch follows speed ----
  SoundFX.prototype.startEngine = function () {
    var c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = c.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  };

  SoundFX.prototype.engine = function (speed01, throttle) {
    if (!this.ctx) return;
    var t = this.now();
    var f = 50 + speed01 * 130 + throttle * 22;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(throttle > 0.02 || speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0.0, t, 0.1);
  };

  // ---- Siren: two-tone triangle, gain follows the nearest police car ------
  SoundFX.prototype.startSiren = function () {
    var c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  };

  SoundFX.prototype.siren = function (dt, nearestDist, wanted) {
    if (!this.ctx) return;
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.42;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, this.now(), 0.03);
    }
    var g = 0;
    if (wanted > 0 && nearestDist < 120) g = 0.05 * (1 - nearestDist / 130);
    this.sirenGain.gain.setTargetAtTime(g, this.now(), 0.2);
  };

  // ---- One-shots -----------------------------------------------------------
  SoundFX.prototype.blip = function (freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    var c = this.ctx, t = this.now();
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  SoundFX.prototype.noise = function (dur, filterFreq, vol, type) {
    if (!this.ctx) return;
    var c = this.ctx, t = this.now();
    var s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    var f = c.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq;
    var g = c.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  };

  SoundFX.prototype.gunshot = function () { this.noise(0.14, 2400, 0.4, 'bandpass'); this.blip(160, 0.1, 'square', 0.18, 60); };
  SoundFX.prototype.punch = function () { this.blip(130, 0.12, 'sine', 0.3, 55); this.noise(0.08, 500, 0.2); };
  SoundFX.prototype.crash = function () { this.noise(0.3, 420, 0.4); this.blip(90, 0.25, 'sine', 0.25, 40); };
  SoundFX.prototype.pickup = function () { this.blip(880, 0.09, 'sine', 0.2); var self = this; setTimeout(function () { self.blip(1318, 0.14, 'sine', 0.2); }, 90); };
  SoundFX.prototype.horn = function () { this.blip(370, 0.22, 'square', 0.1); this.blip(466, 0.22, 'square', 0.08); };
  SoundFX.prototype.jingle = function () {
    var notes = [523, 659, 784, 1046], self = this;
    notes.forEach(function (n, i) {
      setTimeout(function () { self.blip(n, 0.22, 'triangle', 0.22); }, i * 110);
    });
  };
  SoundFX.prototype.busted = function () {
    var notes = [392, 330, 262], self = this;
    notes.forEach(function (n, i) {
      setTimeout(function () { self.blip(n, 0.3, 'triangle', 0.2); }, i * 160);
    });
  };

  // ---- Music: a small A-minor bass + hat loop, scheduled ahead ------------
  // Am - F - C - G, one bar each, eighth-note bass, hats on the off-beat.
  SoundFX.prototype.startMusic = function () {
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.06;
    this.musicGain.connect(this.master);
    this.musicNext = this.now() + 0.1;
  };

  SoundFX.prototype.music = function () {
    if (!this.ctx) return;
    var roots = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1
    var stepDur = 60 / 112 / 2; // 112 bpm, eighth notes
    while (this.musicNext < this.now() + 0.25) {
      var step = this.musicStep;
      var bar = Math.floor(step / 8) % 4;
      var t = this.musicNext;
      if (step % 2 === 0) {
        var o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.value = roots[bar] * (step % 8 === 6 ? 1.5 : 1);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + stepDur);
      }
      if (step % 2 === 1) {
        var s = this.ctx.createBufferSource();
        s.buffer = this.noiseBuf;
        var f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        var hg = this.ctx.createGain();
        hg.gain.setValueAtTime(0.25, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        s.connect(f); f.connect(hg); hg.connect(this.musicGain);
        s.start(t); s.stop(t + 0.05);
      }
      this.musicStep++;
      this.musicNext += stepDur;
    }
  };

  G.SoundFX = SoundFX;
})();
