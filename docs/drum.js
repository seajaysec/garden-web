// SPDX-License-Identifier: GPL-3.0-only
// Garden's web drum: 24 keys of X0X's 909 and 808 voices (drums.c, x0x/), rendered once a kit and played back.
// Garden drum's page (web/app.js) finds it as window.GardenDrumModule and plays through it.
//
// A kit is 24 keys, each a voice with some of its pots set. A pitched kit is one voice laid a semitone a key
// (key 13 as rendered), the way a multisample sits over the OP-1 Field's drum keys. Each key is rendered twice,
// at a plain and at an accented hit; a velocity of 112 or more plays the accented one. A closed hat cuts the open
// hat of its machine, as on both machines.
'use strict';
(function () {
  const E909 = 0, E808 = 1;
  const V9 = {BD: 0, SD: 1, LT: 2, MT: 3, HT: 4, RS: 5, CP: 6, CH: 7, OH: 8, CR: 9, RD: 10};
  const V8 = {BD: 0, SD: 1, LT: 2, MT: 3, HT: 4, RS: 5, CP: 6, CB: 7, CY: 8, OH: 9, CH: 10};
  const GAIN = [0.3, 0.9];                 // each machine's level into Garden's output: accented, the 909 peaks near 1.56, the 808 near 1.07
  const VEL = [[0.7, 1.0], [0.502, 1.0]];  // plain and accented hit: the 808's plain hit is its 4 V trigger (D8_VEL_NORMAL)

  const k9 = (label, v, pots, hat) => ({e: E909, v: V9[v], label, pots: pots || {}, hat});
  const k8 = (label, v, pots, hat) => ({e: E808, v: V8[v], label, pots: pots || {}, hat});
  const KITS = [
    {name: '808', keys: [
      k8('BD', 'BD'), k8('BD long', 'BD', {Decay: 127}), k8('BD short', 'BD', {Decay: 40}), k8('BD low', 'BD', {Tune: 30}),
      k8('SD', 'SD'), k8('SD snap', 'SD', {Snappy: 127}), k8('RS', 'RS'), k8('CL', 'RS', {Sound: 1}),
      k8('CP', 'CP'), k8('MA', 'CP', {Sound: 1}), k8('LT', 'LT'), k8('MT', 'MT'),
      k8('HT', 'HT'), k8('LC', 'LT', {Sound: 1}), k8('MC', 'MT', {Sound: 1}), k8('HC', 'HT', {Sound: 1}),
      k8('CB', 'CB'), k8('CB low', 'CB', {Tune: 30}), k8('CH', 'CH', {}, 'c'), k8('CH long', 'CH', {Decay: 90}, 'c'),
      k8('OH', 'OH', {}, 'o'), k8('OH short', 'OH', {Decay: 30}, 'o'), k8('CY', 'CY'), k8('CY short', 'CY', {Decay: 30}),
    ]},
    {name: '909', keys: [
      k9('BD', 'BD'), k9('BD long', 'BD', {Decay: 127}), k9('BD short', 'BD', {Decay: 50}), k9('BD punch', 'BD', {Attack: 100}),
      k9('SD', 'SD'), k9('SD snap', 'SD', {Snappy: 127}), k9('SD tight', 'SD', {Decay: 10, Tune: 90}), k9('RS', 'RS'),
      k9('CP', 'CP'), k9('CP long', 'CP', {Tail: 127}), k9('LT', 'LT'), k9('MT', 'MT'),
      k9('HT', 'HT'), k9('LT low', 'LT', {Tune: 20}), k9('HT high', 'HT', {Tune: 110}), k9('CH', 'CH', {}, 'c'),
      k9('CH tight', 'CH', {Decay: 40}, 'c'), k9('OH', 'OH', {}, 'o'), k9('OH short', 'OH', {Decay: 70}, 'o'), k9('RD', 'RD'),
      k9('RD bell', 'RD', {Tune: 90}), k9('CR', 'CR'), k9('CR low', 'CR', {Tune: 40}), k9('RS high', 'RS', {Tune: 110}),
    ]},
    {name: '808 + 909', keys: [
      k8('BD 8', 'BD', {Decay: 127}), k9('BD 9', 'BD'), k8('BD 8s', 'BD'), k9('BD 9s', 'BD', {Decay: 50}),
      k8('SD 8', 'SD'), k9('SD 9', 'SD'), k8('RS 8', 'RS'), k9('RS 9', 'RS'),
      k8('CP 8', 'CP'), k9('CP 9', 'CP'), k8('LT 8', 'LT'), k9('LT 9', 'LT'),
      k8('MT 8', 'MT'), k9('MT 9', 'MT'), k8('HT 8', 'HT'), k9('HT 9', 'HT'),
      k8('CB', 'CB'), k8('CL', 'RS', {Sound: 1}), k8('CH 8', 'CH', {}, 'c'), k9('CH 9', 'CH', {}, 'c'),
      k8('OH 8', 'OH', {}, 'o'), k9('OH 9', 'OH', {}, 'o'), k9('RD', 'RD'), k9('CR', 'CR'),
    ]},
    {name: '808 boom', pitched: k8('boom', 'BD', {Decay: 127})},
    {name: '808 tom', pitched: k8('tom', 'MT', {Decay: 100})},
    {name: '808 conga', pitched: k8('conga', 'MT', {Sound: 1})},
    {name: '808 cowbell', pitched: k8('cowbell', 'CB')},
    {name: '808 clave', pitched: k8('clave', 'RS', {Sound: 1})},
    {name: '909 tom', pitched: k9('tom', 'MT')},
  ];
  const CREDITS = '9W9 by A Thousand Details - https://github.com/athousanddetails/schwung-9W9 · ' +
    '8W8 by A Thousand Details - https://github.com/athousanddetails/schwung-8W8 · ' +
    'as ported to X0X by Charles Vestal (https://github.com/charlesvestal/fm1-x0x, GPL-3.0); hi-hat, ride and crash ' +
    'samples from ER-99 by Matthew Cieplak (GPL-3.0). Changed: rendered as one-shot hits in the browser, sends left out.';

  async function GardenDrumModule() {
    const M = await GardenDrums();
    const name = M._malloc(16);
    function render(spec, accent) {
      M._dr_begin(spec.e);
      for (const [p, value] of Object.entries(spec.pots)) { M.stringToUTF8(p, name, 16); M._dr_set(spec.v, name, value); }
      const n = M._dr_render(spec.v, VEL[spec.e][accent ? 1 : 0], 44100 * 6), at = M._dr_out() >> 2;
      const out = new Float32Array(n), g = GAIN[spec.e];
      for (let i = 0; i < n; ++i) out[i] = M.HEAPF32[at + i] * g;
      return out;
    }
    const cache = new Map();                    // a kit's 24 keys: {plain, accent, rate, hat, e}
    function keysOf(i) {
      if (cache.has(i)) return cache.get(i);
      const kit = KITS[i];
      let keys;
      if (kit.pitched) {
        const plain = render(kit.pitched, 0), accent = render(kit.pitched, 1);
        keys = Array.from({length: 24}, (_, k) => ({plain, accent, rate: Math.pow(2, (k - 12) / 12), e: kit.pitched.e}));
      } else keys = kit.keys.map(s => ({plain: render(s, 0), accent: render(s, 1), rate: 1, hat: s.hat, e: s.e}));
      cache.set(i, keys);
      return keys;
    }

    let ctx = null, out = null, kit = 0, buffers = null;
    const sounding = [];                        // {src, gain, key, hat, e}
    function buffersOf(i) {
      const keys = keysOf(i);
      return keys.map(k => {
        const mk = a => { const b = ctx.createBuffer(1, a.length, 44100); b.copyToChannel(a, 0); return b; };
        return {plain: mk(k.plain), accent: k.accent === k.plain ? null : mk(k.accent), rate: k.rate, hat: k.hat, e: k.e};
      });
    }
    function stop(s, time) {
      try { s.gain.gain.setTargetAtTime(0, time, 0.004); s.src.stop(time + 0.03); } catch (e) {}
    }
    return {
      kits: KITS.map(k => ({name: k.name, pitched: !!k.pitched})),
      credits: CREDITS,
      get kit() { return kit; },
      // `context` an AudioContext, `destination` an AudioNode on it
      start(context, destination) {
        ctx = context; out = ctx.createGain(); out.gain.value = 1; out.connect(destination);
        buffers = buffersOf(kit);
      },
      setKit(i) {
        kit = Math.max(0, Math.min(KITS.length - 1, i | 0));
        if (ctx) { this.allOff(); buffers = buffersOf(kit); }
      },
      keyName(k) {
        const K = KITS[kit];
        return K.pitched ? (k === 12 ? K.pitched.label : String(k - 12 > 0 ? '+' + (k - 12) : k - 12)) : K.keys[k].label;
      },
      // a key 0..23 struck; the hit plays to its end (a drum's keys are one-shots), noteOff does nothing
      noteOn(key, velocity, time) {
        if (!ctx || !buffers) return;
        const b = buffers[((key % 24) + 24) % 24];
        if (b.hat === 'c') for (const s of sounding) if (s.hat === 'o' && s.e === b.e) stop(s, time);
        const src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = velocity >= 112 && b.accent ? b.accent : b.plain;
        src.playbackRate.value = b.rate;
        gain.gain.value = 0.35 + 0.65 * velocity / 127;
        src.connect(gain); gain.connect(out);
        const s = {src, gain, key, hat: b.hat, e: b.e};
        sounding.push(s);
        src.onended = () => { const i = sounding.indexOf(s); if (i >= 0) sounding.splice(i, 1); gain.disconnect(); };
        src.start(Math.max(time, ctx.currentTime));
      },
      noteOff() {},
      allOff() { if (ctx) for (const s of sounding.slice()) stop(s, ctx.currentTime); },
    };
  }
  window.GardenDrumModule = GardenDrumModule;
  window.GardenDrumKits = {KITS, GAIN, VEL};        // for test.mjs
})();
