'use strict';
const VOICES = 6;
const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
const WAVE_NAMES = ['sine', 'triangle', 'saw', 'square'];
const MODES = ['poly', 'mono', 'legato', 'unison'];
const TARGETS = ['pitch', 'filter', 'volume'];
const SHAPES = ['sine', 'triangle', 'square', 'sawtooth'];
const SHAPE_NAMES = ['sine', 'triangle', 'square', 'saw'];

const SYNTH_DEFAULTS = {
  wave: 2, detune: 0, cutoff: 62, resonance: 18,
  attack: 0, decay: 30, sustain: 70, release: 26,
  mode: 0, portamento: 0, spread: 30, envfilter: 45,
  dtime: 3, dfeedback: 35, dmix: 0, rmix: 0,
  lrate: 30, ldepth: 0, ltarget: 0, lshape: 0,
};

const SYNTH_PAGES = [
  {name: 'sound', keys: ['wave', 'detune', 'cutoff', 'resonance']},
  {name: 'envelope', keys: ['attack', 'decay', 'sustain', 'release']},
  {name: 'play', keys: ['mode', 'portamento', 'spread', 'envfilter']},
  {name: 'fx', keys: ['dtime', 'dfeedback', 'dmix', 'rmix']},
  {name: 'lfo', keys: ['lrate', 'ldepth', 'ltarget', 'lshape']},
];

const DELAY_TIMES = ['1/32', '1/16', '1/8t', '1/8', '1/4t', '1/4', '1/2'];
const DELAY_BEATS = [0.125, 0.25, 1 / 3, 0.5, 2 / 3, 1, 2];

const SYNTH_PARAMS = {
  wave: {label: 'wave', steps: 4, text: v => WAVE_NAMES[v]},
  detune: {label: 'detune', max: 100, text: v => v + ' ct'},
  cutoff: {label: 'cutoff', max: 100, text: v => Math.round(cutoffHz(v)) + ' Hz'},
  resonance: {label: 'resonance', max: 100},
  attack: {label: 'attack', max: 100, text: v => envTime(v).toFixed(2) + ' s'},
  decay: {label: 'decay', max: 100, text: v => envTime(v).toFixed(2) + ' s'},
  sustain: {label: 'sustain', max: 100},
  release: {label: 'release', max: 100, text: v => envTime(v).toFixed(2) + ' s'},
  mode: {label: 'mode', steps: 4, text: v => MODES[v]},
  portamento: {label: 'portamento', max: 100, text: v => v ? glideTime(v).toFixed(2) + ' s' : 'off'},
  spread: {label: 'unison spread', max: 100},
  envfilter: {label: 'env to filter', max: 100},
  dtime: {label: 'delay time', steps: 7, text: v => DELAY_TIMES[v]},
  dfeedback: {label: 'delay feedback', max: 95},
  dmix: {label: 'delay mix', max: 100},
  rmix: {label: 'reverb mix', max: 100},
  lrate: {label: 'lfo rate', max: 100, text: v => lfoHz(v).toFixed(2) + ' Hz'},
  ldepth: {label: 'lfo depth', max: 100},
  ltarget: {label: 'lfo target', steps: 3, text: v => TARGETS[v]},
  lshape: {label: 'lfo shape', steps: 4, text: v => SHAPE_NAMES[v]},
};

function cutoffHz(v) { return 40 * Math.pow(2, v / 100 * 9); }
function envTime(v) { return 0.002 + Math.pow(v / 100, 2.2) * 6; }
function glideTime(v) { return Math.pow(v / 100, 2) * 1.5; }
function lfoHz(v) { return 0.05 * Math.pow(2, v / 100 * 8.3); }
function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

class GardenSynth {
  constructor() {
    this.p = Object.assign({}, SYNTH_DEFAULTS);
    this.ready = false;
    this.bpm = 120;
    this.voices = [];
    this.stack = [];
    this.lastFreq = 0;
    this.age = 0;
  }
  start() {
    if (this.ready) return Promise.resolve();
    this.ready = true;
    const T = window.Tone;
    this.limiter = new T.Limiter(-1).toDestination();
    this.volume = new T.Volume(-10).connect(this.limiter);
    this.reverb = new T.Reverb({decay: 3.2, preDelay: 0.01, wet: 0}).connect(this.volume);
    this.delay = new T.FeedbackDelay({delayTime: 0.25, feedback: 0.35, wet: 0}).connect(this.reverb);
    this.trem = new T.Gain(1).connect(this.delay);
    this.lfo = new T.LFO({frequency: 1, min: 0, max: 0}).start();
    this.lfoVol = new T.LFO({frequency: 1, min: 1, max: 1}).start();
    this.lfoVol.connect(this.trem.gain);
    for (let i = 0; i < VOICES; ++i) {
      const s = new T.MonoSynth({oscillator: {type: 'fatsawtooth', count: 2, spread: 12}, filter: {type: 'lowpass', rolloff: -24},
        envelope: {attackCurve: 'linear'}, filterEnvelope: {}});
      s.connect(this.trem);
      this.voices.push({s, note: -1, held: false, at: 0, pitchLfo: null, filterLfo: null});
    }
    for (const v of this.voices) {
      v.pitchLfo = new T.LFO({frequency: 1, min: 0, max: 0}).start(); v.pitchLfo.connect(v.s.detune);
      v.filterLfo = new T.LFO({frequency: 1, min: 0, max: 0}).start(); v.filterLfo.connect(v.s.filter.frequency);
    }
    this.apply();
    return T.start();
  }
  mono() { return this.p.mode !== 0; }
  set(key, value) {
    const d = SYNTH_PARAMS[key];
    const top = d.steps ? d.steps - 1 : d.max;
    this.p[key] = Math.max(0, Math.min(top, Math.round(value)));
    if (key === 'mode') this.allOff();
    this.apply();
  }
  load(p) {
    for (const k of Object.keys(SYNTH_DEFAULTS)) {
      const d = SYNTH_PARAMS[k], top = d.steps ? d.steps - 1 : d.max;
      if (typeof p[k] === 'number' && isFinite(p[k])) this.p[k] = Math.max(0, Math.min(top, Math.round(p[k])));
    }
    this.apply();
  }
  apply() {
    if (!this.ready) return;
    const p = this.p, wave = WAVES[p.wave];
    const unison = p.mode === 3;
    const count = unison ? 5 : p.detune > 0 ? 2 : 1;
    const spread = unison ? 8 + p.spread * 0.9 + p.detune : p.detune;
    const opts = {
      oscillator: {type: 'fat' + wave, count, spread},
      envelope: {attack: envTime(p.attack), decay: envTime(p.decay), sustain: p.sustain / 100, release: envTime(p.release)},
      filter: {Q: p.resonance / 100 * 14 + 0.3},
      filterEnvelope: {attack: envTime(p.attack), decay: envTime(p.decay), sustain: p.sustain / 100, release: envTime(p.release),
        baseFrequency: cutoffHz(p.cutoff), octaves: p.envfilter / 100 * 6, exponent: 2},
      portamento: glideTime(p.portamento),
    };
    for (const v of this.voices) v.s.set(opts);
    this.delay.delayTime.value = DELAY_BEATS[p.dtime] * 60 / this.bpm;
    this.delay.feedback.value = p.dfeedback / 100;
    this.delay.wet.value = p.dmix / 100;
    this.reverb.wet.value = p.rmix / 100;
    const hz = lfoHz(p.lrate), depth = p.ldepth / 100, shape = SHAPES[p.lshape];
    for (const l of [this.lfoVol, ...this.voices.flatMap(v => [v.pitchLfo, v.filterLfo])]) { l.frequency.value = hz; l.type = shape; }
    const cut = cutoffHz(p.cutoff);
    for (const v of this.voices) {
      v.pitchLfo.min = p.ltarget === 0 ? -depth * 200 : 0; v.pitchLfo.max = p.ltarget === 0 ? depth * 200 : 0;
      v.filterLfo.min = p.ltarget === 1 ? -depth * cut * 0.9 : 0; v.filterLfo.max = p.ltarget === 1 ? depth * cut * 3 : 0;
    }
    this.lfoVol.min = p.ltarget === 2 ? 1 - depth : 1; this.lfoVol.max = 1;
  }
  tempo(bpm) { this.bpm = bpm; if (this.ready) this.delay.delayTime.value = DELAY_BEATS[this.p.dtime] * 60 / bpm; }
  noteOn(note, vel, time) {
    if (!this.ready) return;
    const f = mtof(note), g = vel / 127;
    if (this.mono()) {
      const v = this.voices[0], legato = this.p.mode === 2 && this.stack.length > 0;
      this.stack = this.stack.filter(n => n !== note); this.stack.push(note);
      if (legato) v.s.setNote(f, time); else v.s.triggerAttack(f, time, g);
      v.note = note; v.held = true;
      return;
    }
    let v = this.voices.find(x => !x.held && x.note === -1) ||
            this.voices.filter(x => !x.held).sort((a, b) => a.at - b.at)[0] ||
            this.voices.slice().sort((a, b) => a.at - b.at)[0];
    if (this.p.portamento && this.lastFreq) v.s.frequency.setValueAtTime(this.lastFreq, time);
    v.s.triggerAttack(f, time, g);
    v.note = note; v.held = true; v.at = ++this.age;
    this.lastFreq = f;
  }
  noteOff(note, time) {
    if (!this.ready) return;
    if (this.mono()) {
      const v = this.voices[0];
      const top = this.stack[this.stack.length - 1];
      this.stack = this.stack.filter(n => n !== note);
      if (note !== top) return;
      if (this.stack.length) {
        const back = this.stack[this.stack.length - 1];
        if (this.p.mode === 2 || this.p.mode === 3) v.s.setNote(mtof(back), time); else v.s.triggerAttack(mtof(back), time, 0.8);
        v.note = back;
      } else { v.s.triggerRelease(time); v.held = false; v.note = -1; }
      return;
    }
    const v = this.voices.find(x => x.held && x.note === note);
    if (!v) return;
    v.s.triggerRelease(time); v.held = false; v.note = -1;
  }
  allOff() {
    if (!this.ready) return;
    const t = window.Tone.now();
    for (const v of this.voices) { v.s.triggerRelease(t); v.held = false; v.note = -1; }
    this.stack = [];
  }
  now() { return this.ready ? window.Tone.now() : 0; }
}
