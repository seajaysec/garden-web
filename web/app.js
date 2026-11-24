'use strict';
(async function () {
  const REPO = 'seajaysec/garden-op1f';
  const KNOBS = ['blue', 'tan', 'gray', 'orange'];
  const W = {DOWN: 1, DOWN_SHIFT: 2, UP: 3, TURN: 4};
  const K = {help: 0, t: 6, numbers: [45, 46, 47, 16, 17, 18, 19, 20], click: 54, press: 61};
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const PAGES = ['play', 'rhythm', 'palette', 'gardens'];
  const FIELD_CC = {turn: {1: 0, 2: 1, 3: 2, 4: 3}, press: {66: 0, 67: 1, 68: 2, 69: 3}, pulse: {59: 0, 60: 1, 61: 2, 62: 3},
    t: {11: 0, 12: 1, 13: 2, 14: 3}, numbers: {50: 0, 51: 1, 52: 2, 21: 3, 22: 4, 23: 5, 24: 6, 25: 7},
    help: 5, synth: 7, seq: 26, left: 41, right: 42};
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem('garden.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('garden.' + k, v); } catch (e) {} },
    clear() { try { for (const k of Object.keys(localStorage)) if (k.startsWith('garden.')) localStorage.removeItem(k); } catch (e) {} },
  };
  const b64 = {
    from(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    to(text) { const s = atob(text.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); },
  };
  const noteName = n => NOTE[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

  // Garden drum's look in drum mode: Garden's picture with a drum's palette, the bloom's centre a drumhead and the sun
  // a cymbal, in the blue knob's colour (the blue knob still owns the cascade)
  const HUE = ['#AEB1DC', '#35D2BA', '#FF8380', '#65FF00', '#698EFF', '#F15A29', '#00ED95', '#837CC7', '#FF3A5D', '#FFB7B3', '#CC6699', '#747F8A'];
  const DRUM_HUE = ['#E8D7B0', '#D9A441', '#D7263D', '#B8C2CC', '#C77B43', '#E3B778', '#8FA9BD', '#A65E3A', '#F0C75E', '#F3E9D2', '#B23A48', '#8B8F96'];
  function drumTheme(svg) {
    const BRASS = '#D9A441', SKIN = '#E8D7B0', BLUE = '#3C6087';
    for (let i = 0; i < HUE.length; ++i) svg = svg.split(HUE[i]).join('@@' + i + '@@');
    for (let i = 0; i < HUE.length; ++i) svg = svg.split('@@' + i + '@@').join(DRUM_HUE[i]);
    const head = rx => {
      let s = '<ellipse cx="240" cy="78" rx="' + rx + '" ry="14" fill="' + SKIN + '" stroke="' + BRASS + '" stroke-width="2.4"/>';
      for (let j = 0; j < 8; ++j) {
        const a = j / 8 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        s += '<path fill="none" stroke="' + BRASS + '" stroke-width="2" stroke-linecap="round" d="M' + (240 + c * (rx + 1)).toFixed(2) + ',' +
          (78 + sn * 15).toFixed(2) + 'L' + (240 + c * (rx + 4)).toFixed(2) + ',' + (78 + sn * 18).toFixed(2) + '"/>';
      }
      return s;
    };
    const part = (i, body) => { svg = svg.replace(new RegExp('<g id="n' + i + '">[\\s\\S]*?</g>'), '<g id="n' + i + '">' + body + '</g>'); };
    part(439, head(15)); part(440, head(19));
    const bell = '<path fill="none" stroke="' + BLUE + '" stroke-width="1.5" stroke-linecap="round" d="M-2.6,-1.6Q0,-4.4 2.6,-1.6"/>';
    part(33, '<ellipse rx="9" ry="2.6" fill="none" stroke="' + BLUE + '" stroke-width="1.5"/>' + bell);
    part(34, '<ellipse rx="9" ry="2.6" fill="' + BLUE + '" stroke="' + BLUE + '" stroke-width="1.5"/>' + bell.replace('fill="none"', 'fill="' + BLUE + '"'));
    return svg;
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) location.reload(); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const build = await fetch('build.json', {cache: 'no-cache'}).then(r => r.json()).catch(() => ({garden: '?', pack: ''}));
  $('version').innerHTML = '<a href="https://github.com/seajaysec/garden-op1f" target="_blank" rel="noopener">Garden ' + build.garden + '</a>' +
    (build.pack ? ' · pack ' + build.pack.slice(0, 8) : '');

  // ---- link state, then stored state
  const hash = new URLSearchParams(location.hash.slice(1));
  const synth = new GardenSynth();
  let synthSaved = hash.get('s') || store.get('synth2');
  if (synthSaved) { try { synth.load(JSON.parse(atob(synthSaved))); } catch (e) {} }
  let bpm = +(hash.get('bpm') || store.get('bpm') || 120);
  let view = {garden: 'synth', synth: 'sound'}[hash.get('v') || store.get('view')] || hash.get('v') || store.get('view') || 'synth';
  if (!['synth', 'drum', 'sound'].includes(view)) view = 'synth';
  const isGarden = () => view !== 'sound';
  let seqOn = true;                                     // Garden is on; only a Field's own Sequencer key (MIDI) switches it
  let octave = 0;

  // ---- the drum: X0X's 909 and 808 on its 24 keys (drum.js), and each Garden's level
  const drum = await GardenDrumModule();
  drum.setKit(+(hash.get('k') || store.get('kit') || 0));
  const mix = {synth: -18, drum: 4};                   // dB
  try { Object.assign(mix, JSON.parse(hash.get('mix') || store.get('mix') || '{}')); } catch (e) {}
  const keyOf = n => (((n - 53 - 12 * octave) % 24) + 24) % 24;   // the drum's key a note lands on, the octave counted

  // ---- two Gardens, each its own engine and settings: Garden synth plays the synth, Garden drum the drum
  const gardens = {};
  for (const kind of ['synth', 'drum']) {
    const E = await GardenEngine();
    const fileBytes = hash.get(kind === 'synth' ? 'g' : 'gd') || store.get(kind === 'synth' ? 'file' : 'file-drum');
    if (fileBytes) {
      try { const b = b64.to(fileBytes); E.HEAPU8.set(b, E._gw_file()); E._gw_file_set(b.length); } catch (e) {}
    }
    E._gw_instrument(kind === 'drum' ? 1 : 0);
    E._gw_mono(kind === 'synth' && synth.mono() ? 1 : 0);
    gardens[kind] = {kind, M: E, fileWrites: 0, lit: new Set(), S: null,
      out: kind === 'synth' ? synth : {noteOn: (n, v, t) => drum.noteOn(keyOf(n), v, t), noteOff() {}}};
  }
  let cur = gardens[view === 'drum' ? 'drum' : 'synth'];   // the Garden shown, or last shown while Sound is up
  let M = cur.M;
  const SETTINGS = M._gw_settings_bytes();

  // ---- the screen: the pack's own picture, posed as the unit poses it
  const svgText = await fetch('screen.svg', {cache: 'no-cache'}).then(r => r.text());
  const drumSvg = drumTheme(svgText);
  const PARTS = M._gw_part_count(), TEXTS = M._gw_text_count();
  let partEl = [], partWas = [], textEl = [], textWas = [], look = null;
  // Garden drum in drum mode wears the drum theme; Garden synth, and Garden drum in melodic mode, Garden's own look
  function mount(drumLook) {
    if (look === drumLook) return;
    look = drumLook;
    $('screen').innerHTML = drumLook ? drumSvg : svgText;
    const svg = $('screen').querySelector('svg');
    partEl = []; partWas = []; textEl = []; textWas = [];
    for (let i = 0; i < PARTS; ++i) {
      const el = svg.querySelector('#n' + i);
      partEl.push(el); partWas.push('');
      if (el) el.setAttribute('display', 'none');
    }
    for (let i = 0; i < TEXTS; ++i) {
      const g = svg.querySelector('#t' + i);
      let t = null;
      if (g) {
        const colour = (g.querySelector('path') || g).getAttribute('stroke') || '#fff';
        t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('fill', colour); t.setAttribute('font-size', '14'); t.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        g.replaceWith(t);
      }
      textEl.push(t); textWas.push('');
    }
  }
  const drumLook = () => cur.kind === 'drum' && !!(cur.S ? cur.S.kit : JSON.parse(M.UTF8ToString(M._gw_state(0))).kit);
  mount(drumLook());
  function paint() {
    const base = M._gw_parts() >> 2, h = M.HEAP32;
    for (let i = 0; i < PARTS; ++i) {
      const el = partEl[i]; if (!el) continue;
      const o = base + i * 7, on = h[o];
      const key = on ? h[o + 1] + ',' + h[o + 2] + ',' + h[o + 3] + ',' + h[o + 4] + ',' + h[o + 5] + ',' + h[o + 6] : '';
      if (key === partWas[i]) continue;
      partWas[i] = key;
      if (!on) { el.setAttribute('display', 'none'); continue; }
      el.removeAttribute('display');
      el.setAttribute('transform', 'matrix(' + [1, 2, 3, 4, 5, 6].map(k => h[o + k] / 1024).join(' ') + ')');
    }
    for (let i = 0; i < TEXTS; ++i) {
      const t = textEl[i]; if (!t) continue;
      const s = M.UTF8ToString(M._gw_text(i)), x = M._gw_text_x(i), y = M._gw_text_y(i), a = M._gw_text_align(i);
      const key = s + '|' + x + '|' + y + '|' + a;
      if (key === textWas[i]) continue;
      textWas[i] = key;
      t.textContent = s; t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('text-anchor', ['start', 'middle', 'end'][a] || 'start');
    }
  }

  // ---- notes: Garden's and the instrument's, to the synth and the roll
  const roll = [];
  function drain(time, G) {
    G = G || cur;
    const E = G.M, n = E._gw_notes();
    for (let i = 0; i < n; ++i) {
      const w = E._gw_note(i), note = w & 255, vel = (w >> 8) & 255, on = (w >> 16) & 1;
      if (on) { if (ticking) G.out.noteOn(note, vel, time); G.lit.add(note); roll.push({note, t0: time, t1: 0, src: 'g', vel, g: G.kind}); }
      else {
        if (ticking) G.out.noteOff(note, time); G.lit.delete(note);
        for (let j = roll.length - 1; j >= 0; --j) if (roll[j].g === G.kind && roll[j].src === 'g' && roll[j].note === note && !roll[j].t1) { roll[j].t1 = time; break; }
      }
    }
    if (n) { E._gw_notes_clear(); if (G === cur) lights(); }
  }

  // ---- the clock: 96 pulses a quarter, as the sequencer is ticked
  let nextTick = 0, ticking = false;
  const LOOK = 0.035;
  function pump() {
    if (!ticking) return;
    const now = synth.now();
    if (nextTick < now - 0.2) nextTick = now + 0.005;
    const us = Math.round(60e6 / (bpm * 96));
    while (nextTick < now + LOOK) {
      for (const G of Object.values(gardens)) { G.M._gw_tick(bpm * 100, us, 0); drain(nextTick, G); }
      nextTick += us / 1e6;
    }
  }
  let worker = null;
  try {
    worker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),8)'], {type: 'text/javascript'})));
    worker.onmessage = pump;
  } catch (e) { setInterval(pump, 8); }

  // ---- shift: the keyboard's or the Field's help key held; the screen's held, or tapped to arm it for the next control
  const shiftBy = {kbd: false, panel: false, field: false, armed: false};
  const shift = () => shiftBy.kbd || shiftBy.panel || shiftBy.field || shiftBy.armed;
  function shiftShown() {
    $('shift-badge').classList.toggle('on', shift());
    $('shift-key').classList.toggle('down', shiftBy.panel);
    $('shift-key').classList.toggle('latched', shiftBy.armed && !shiftBy.panel);
    lanes();
  }
  let fieldHelpUsed = false, panelUsed = false, liftPending = false, liftTimer = 0, dragging = 0;
  function used() {
    if (shiftBy.field) fieldHelpUsed = true;
    if (shiftBy.panel) panelUsed = true;
    if (shiftBy.armed) liftPending = true;
  }
  function lift() { clearTimeout(liftTimer); if (liftPending) { liftPending = false; shiftBy.armed = false; shiftShown(); } }
  function liftLater() { if (!dragging && liftPending) { clearTimeout(liftTimer); liftTimer = setTimeout(lift, 450); } }

  // ---- what each control does: Garden's keys go to its page; the synth's knobs edit the synth
  const log = [];
  function note(s) { log.push(s); if (log.length > 48) log.shift(); }
  function input(what, key, turn, G) { G = G || cur; const r = G.M._gw_input(what, key, turn || 0, shift() ? 1 : 0); drain(synth.now(), G); return r; }
  const down = () => shift() ? W.DOWN_SHIFT : W.DOWN;

  let synthPage = 0;
  const pressed = [0, 0, 0, 0], turned = [0, 0, 0, 0];
  function turnKnob(k, steps) {
    if (!steps) return; used();
    if (pressed[k]) turned[k] = 1;
    if (isGarden()) { input(W.TURN, k, steps * 1024); note((shift() ? 'shift+' : '') + KNOBS[k] + (steps > 0 ? ' +' : ' ') + steps); }
    else {
      const key = SYNTH_PAGES[synthPage].keys[k], d = SYNTH_PARAMS[key];
      synth.set(key, synth.p[key] + steps * (d.steps ? 1 : 2));
      if (key === 'mode') { gardens.synth.M._gw_mono(synth.mono() ? 1 : 0); $('synth-mode').value = String(synth.p.mode); }
      store.set('synth2', btoa(JSON.stringify(synth.p)));
      note('synth ' + key + ' ' + synth.p[key]);
    }
    spin(k, steps); lanes(); drawSynth(); liftLater();
  }
  function pressKnob(k) {
    used(); pressed[k] = 1; turned[k] = 0;
    $$knob[k].classList.add('down');
    if (isGarden()) input(down(), K.press + k);
  }
  function releaseKnob(k) {
    if (!pressed[k]) return;
    pressed[k] = 0; $$knob[k].classList.remove('down');
    if (isGarden()) {
      input(W.UP, K.press + k);
      if (!turned[k]) { input(down(), K.click + k); input(W.UP, K.click + k); note((shift() ? 'shift+' : '') + 'push ' + KNOBS[k]); }
    }
    lift();
  }
  // `G` names the Garden when a computer key says which (1-8 the synth's, q-i the drum's...); else the one shown
  const shown = G => isGarden() && G === cur;
  function tKey(i, isDown, G) {
    used();
    const to = G || (isGarden() ? cur : null);
    if (to) { input(isDown ? down() : W.UP, K.t + i, 0, to); if (isDown) note((shift() ? 'shift+' : '') + to.kind + ' T' + (i + 1)); }
    else if (isDown) { synthPage = i === 0 ? 0 : i === 1 ? (shift() ? 2 : 1) : i + 1; lanes(); drawSynth(); }
    if (!isDown) lift();
  }
  function numberKey(i, isDown, G) {
    used();
    const to = G || (isGarden() ? cur : null);
    if (!G || shown(G)) $$num[i].classList.toggle('down', isDown);
    if (to) { input(isDown ? down() : W.UP, K.numbers[i], 0, to); if (isDown) note((shift() ? 'shift+' : '') + to.kind + ' ' + (i + 1)); }
    if (!isDown) lift();
  }
  function pushKey(k, isDown, G) {                     // a knob's push from a computer key: down presses, up pushes
    used();
    if (shown(G)) $$knob[k].classList.toggle('down', isDown);
    if (isDown) { input(down(), K.press + k, 0, G); return; }
    input(W.UP, K.press + k, 0, G);
    input(down(), K.click + k, 0, G); input(W.UP, K.click + k, 0, G);
    note((shift() ? 'shift+' : '') + G.kind + ' push ' + KNOBS[k]);
    lift();
  }
  function helpKey(isDown) {
    used();
    if (!isDown) setTimeout(lift, 0);
    if (!isGarden()) return;
    input(isDown ? down() : W.UP, K.help);
    if (isDown) note('help');
  }

  // ---- piano keys: Garden is asked first; what it leaves, the instrument plays
  const taken = new Map(), passed = new Map();
  function keyDown(id, k, n, vel, midi) {
    used();
    if (!ticking) return;
    if (taken.has(id) || passed.has(id)) keyUp(id);
    const G = cur, r = G.M._gw_key(1, k, n, vel, shift() ? 1 : 0, midi ? 1 : 0);
    drain(synth.now(), G);
    if (r) taken.set(id, {k, n, G});
    else { G.out.noteOn(n, vel, synth.now()); passed.set(id, {n, G}); roll.push({note: n, t0: synth.now(), t1: 0, src: 'i', vel, g: G.kind}); }
    note('key ' + (G.kind === 'drum' ? 'drum ' + (keyOf(n) + 1) : noteName(n)) + (r ? '' : ' (played by the ' + G.kind + ')'));
    lights();
  }
  function keyUp(id) {
    if (taken.has(id)) { const e = taken.get(id); taken.delete(id); e.G.M._gw_key(0, e.k, e.n, 0, 0, 0); drain(synth.now(), e.G); }
    else if (passed.has(id)) {
      const {n, G} = passed.get(id); passed.delete(id); G.out.noteOff(n, synth.now());
      for (let j = roll.length - 1; j >= 0; --j) if (roll[j].g === G.kind && roll[j].src === 'i' && roll[j].note === n && !roll[j].t1) { roll[j].t1 = synth.now(); break; }
    }
    lights(); lift();
  }

  // ---- the panel
  function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (x) {} }
  const $$knob = [...document.querySelectorAll('[data-knob]')];
  const knobAngle = [0, 0, 0, 0];
  function spin(k, steps) { knobAngle[k] += steps * 12; $$knob[k].querySelector('.tick').style.transform = 'rotate(' + knobAngle[k] + 'deg)'; }
  $$knob.forEach((el, k) => {
    let y0 = 0, done = 0, id = null, moved = false;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); capture(el, e); id = e.pointerId; y0 = e.clientY; done = 0; moved = false; ++dragging;
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const steps = Math.trunc((y0 - e.clientY) / 9) - done;
      if (steps) { moved = true; done += steps; turnKnob(k, steps); }
    });
    const end = e => {
      if (e.pointerId !== id) return; id = null; --dragging;
      if (!moved) { pressKnob(k); releaseKnob(k); } else lift();
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', e => { if (e.pointerId === id) { id = null; --dragging; lift(); } });
    el.addEventListener('wheel', e => { e.preventDefault(); turnKnob(k, e.deltaY < 0 ? 1 : -1); }, {passive: false});
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); turnKnob(k, 1); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); turnKnob(k, -1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pressKnob(k); releaseKnob(k); }
    });
  });
  function hold(el, on, off) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); capture(el, e); el.classList.add('down'); on(); });
    const up = () => { if (!el.classList.contains('down')) return; el.classList.remove('down'); off(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  document.querySelectorAll('[data-control^="t"]').forEach(el => { const i = +el.dataset.control.slice(1); hold(el, () => tKey(i, true), () => tKey(i, false)); });
  hold(document.querySelector('[data-control="help"]'), () => helpKey(true), () => helpKey(false));
  hold($('shift-key'), () => { shiftBy.panel = true; panelUsed = false; shiftShown(); },
    () => { shiftBy.panel = false; if (!panelUsed) { shiftBy.armed = !shiftBy.armed; liftPending = false; } shiftShown(); });

  const numbers = $('numbers'), $$num = [];
  for (let i = 0; i < 8; ++i) {
    const b = document.createElement('button');
    b.className = 'num'; b.innerHTML = '<b>' + (i + 1) + '</b><small></small><kbd></kbd>';
    numbers.appendChild(b); $$num.push(b);
    b.addEventListener('pointerdown', e => { e.preventDefault(); capture(b, e); numberKey(i, true); });
    const up = () => { if (b.classList.contains('down')) numberKey(i, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }

  const piano = $('piano'), $$key = [];
  const BLACK = [1, 3, 6, 8, 10];
  (function () {
    const whites = [];
    for (let k = 0; k < 24; ++k) if (!BLACK.includes((k + 5) % 12)) whites.push(k);
    for (let k = 0; k < 24; ++k) {
      const pc = (k + 5) % 12, el = document.createElement('div');
      if (BLACK.includes(pc)) { el.className = 'b'; const w = whites.indexOf(k - 1); el.style.left = 'calc(' + ((w + 1) / whites.length * 100) + '% - 3.2%)'; el.style.width = '6.4%'; }
      else { el.className = 'w'; if (pc === 0) el.innerHTML = '<span class="c-mark"></span>'; }
      el.appendChild(document.createElement('kbd'));
      el.dataset.k = k; piano.appendChild(el); $$key[k] = el;
    }
    const fingers = new Map();
    const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest('.piano > div'); };
    const press = (pid, el) => { const k = +el.dataset.k; fingers.set(pid, k); el.classList.add('down'); keyDown('p' + k, k, 53 + k + 12 * octave, 100, false); };
    const lift = pid => { const k = fingers.get(pid); if (k === undefined) return; fingers.delete(pid); if (![...fingers.values()].includes(k)) { $$key[k].classList.remove('down'); keyUp('p' + k); } };
    piano.addEventListener('pointerdown', e => { e.preventDefault(); const el = keyAt(e.clientX, e.clientY); if (el) { capture(piano, e); press(e.pointerId, el); } });
    piano.addEventListener('pointermove', e => {
      if (!fingers.has(e.pointerId)) return;
      const el = keyAt(e.clientX, e.clientY);
      if (el && +el.dataset.k !== fingers.get(e.pointerId)) { lift(e.pointerId); press(e.pointerId, el); }
    });
    piano.addEventListener('pointerup', e => lift(e.pointerId)); piano.addEventListener('pointercancel', e => lift(e.pointerId));
  })();
  function octaveMarks() { $$key.forEach((el, k) => { const m = el.querySelector('.c-mark'); if (m) m.textContent = noteName(53 + k + 12 * octave); }); }
  function setOctave(o) { octave = Math.max(-3, Math.min(3, o)); octaveMarks(); lights(); }
  $('oct-down').onclick = () => setOctave(octave - 1); $('oct-up').onclick = () => setOctave(octave + 1);
  octaveMarks();
  function lights() {
    for (let k = 0; k < 24; ++k) $$key[k].classList.toggle('lit', cur.lit.has(53 + k + 12 * octave));
  }

  // ---- the computer's keys, by their place (Shift does not change them)
  //   controls  1-8 Garden synth's number keys, q-i Garden drum's; a s d f T1-T4 of the synth, h j k l of the drum;
  //             z x c v the synth's knob pushes, n m , . the drum's; Shift is shift; / help; the arrows the octave
  //   `         swaps them for a piano on the Garden shown (the last one shown while Sound is up), and back
  const KEYS = {
    synth: {numbers: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
            t: ['KeyA', 'KeyS', 'KeyD', 'KeyF'], push: ['KeyZ', 'KeyX', 'KeyC', 'KeyV']},
    drum: {numbers: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI'],
           t: ['KeyH', 'KeyJ', 'KeyK', 'KeyL'], push: ['KeyN', 'KeyM', 'Comma', 'Period']},
  };
  const PIANO = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
  const cap = c => ({Comma: ',', Period: '.', Semicolon: ';'}[c] || c.replace(/^(Key|Digit)/, '').toLowerCase());
  const bind = {};
  for (const kind of ['synth', 'drum']) {
    const B = KEYS[kind], G = gardens[kind];
    B.numbers.forEach((c, i) => { bind[c] = on => numberKey(i, on, G); });
    B.t.forEach((c, i) => { bind[c] = on => tKey(i, on, G); });
    B.push.forEach((c, i) => { bind[c] = on => pushKey(i, on, G); });
  }
  let pianoKeys = false;
  // the caps beside the controls name the keys of the Garden shown; they show once the computer's keys are used
  function caps() {
    const B = KEYS[cur.kind], piano = pianoKeys;
    $$num.forEach((b, i) => { b.querySelector('kbd').textContent = piano ? '' : cap(B.numbers[i]); });
    document.querySelectorAll('[data-control^="t"]').forEach(b => { b.querySelector('kbd').textContent = piano ? '' : cap(B.t[+b.dataset.control.slice(1)]); });
    $$knob.forEach((el, k) => { el.parentNode.querySelector('kbd[data-push="' + k + '"]').textContent = piano ? '' : cap(B.push[k]); });
    $$key.forEach((el, k) => { const c = el.querySelector('kbd'); c.textContent = piano && k >= 7 && PIANO[k - 7] ? cap(PIANO[k - 7]) : ''; });
    $('keys-mode').textContent = piano ? 'keys: piano · ` for the controls' : 'keys: controls · ` for a piano';
  }
  const kbdHeld = new Map();                          // a piano key's code: the id it went down with
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('textarea,input[type=text],select,dialog')) return;
    if (!document.body.classList.contains('kbd')) { document.body.classList.add('kbd'); caps(); }
    if (e.key === 'Shift') { shiftBy.kbd = true; shiftShown(); return; }
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Backquote') {
      e.preventDefault();
      for (const [c, id] of kbdHeld) { keyUp(id); $$key[7 + PIANO.indexOf(c)].classList.remove('down'); }
      kbdHeld.clear();
      pianoKeys = !pianoKeys; caps(); note(pianoKeys ? 'keys: piano' : 'keys: controls');
      return;
    }
    if (e.code === 'Slash') { helpKey(true); return; }
    if (e.key === 'ArrowLeft' && !e.target.closest('.knob')) { setOctave(octave - 1); return; }
    if (e.key === 'ArrowRight' && !e.target.closest('.knob')) { setOctave(octave + 1); return; }
    if (pianoKeys) {
      const i = PIANO.indexOf(e.code);
      if (i < 0 || kbdHeld.has(e.code)) return;
      e.preventDefault();
      const key = 7 + i, id = 'c' + e.code;
      kbdHeld.set(e.code, id); $$key[key].classList.add('down'); keyDown(id, key, 53 + key + 12 * octave, 100, false);
      return;
    }
    if (bind[e.code]) { e.preventDefault(); bind[e.code](true); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'Shift') { shiftBy.kbd = false; shiftShown(); return; }
    if (e.code === 'Slash') { helpKey(false); return; }
    if (kbdHeld.has(e.code)) { const id = kbdHeld.get(e.code); kbdHeld.delete(e.code); $$key[7 + PIANO.indexOf(e.code)].classList.remove('down'); keyUp(id); return; }
    if (!pianoKeys && bind[e.code]) bind[e.code](false);
  });
  window.addEventListener('blur', () => { shiftBy.kbd = false; shiftShown(); });

  // ---- MIDI: a Field in controller mode (its help key held is shift), or any keyboard
  const fieldPress = [0, 0, 0, 0];
  function midiMessage(port, e) {
    const [st, d1, d2] = e.data, type = st & 0xf0;
    const field = /op-?1/i.test(port.name || '');
    if (type === 0x90 || type === 0x80) {
      const on = type === 0x90 && d2 > 0, id = 'm' + port.id + ':' + d1, k = d1 - 53;
      if (on) {
        if (!field && seqOn && (k < 0 || k > 23)) { hint("That note is outside Garden's 24 keys (F3 to E5): the unit drops it too."); return; }
        keyDown(id, k, d1, d2, !field);
      } else keyUp(id);
      return;
    }
    if (type !== 0xb0 || !field) return;
    const v = d2, isDown = v >= 64;
    if (d1 in FIELD_CC.turn) { const d = v === 64 ? 0 : v < 64 ? v : v - 128; turnKnob(FIELD_CC.turn[d1], d); return; }
    if (d1 in FIELD_CC.press) { const k = FIELD_CC.press[d1]; if (isDown) { fieldPress[k] = performance.now(); pressKnob(k); } else releaseKnob(k); return; }
    if (d1 in FIELD_CC.pulse) { const k = FIELD_CC.pulse[d1]; if (isDown && performance.now() - fieldPress[k] > 1500 && !pressed[k]) { pressKnob(k); releaseKnob(k); } return; }
    if (d1 in FIELD_CC.t) { tKey(FIELD_CC.t[d1], isDown); return; }
    if (d1 in FIELD_CC.numbers) { numberKey(FIELD_CC.numbers[d1], isDown); return; }
    if (d1 === FIELD_CC.help) {
      if (isDown) { shiftBy.field = true; fieldHelpUsed = false; shiftShown(); }
      else { shiftBy.field = false; shiftShown(); if (!fieldHelpUsed) { helpKey(true); helpKey(false); } }
      return;
    }
    if (d1 === FIELD_CC.synth && isDown) { setView(view === 'sound' ? cur.kind : 'sound'); return; }
    if (d1 === FIELD_CC.seq && isDown) { setSeq(!seqOn); setView(cur.kind); return; }
    if (d1 === FIELD_CC.left && isDown) { setOctave(octave - 1); return; }
    if (d1 === FIELD_CC.right && isDown) { setOctave(octave + 1); }
  }
  async function midi() {
    if (!navigator.requestMIDIAccess) { $('midi').textContent = 'No MIDI in this browser: play on screen, or open in Chrome to use a Field or a keyboard.'; return; }
    try {
      const access = await navigator.requestMIDIAccess();
      const listen = () => {
        const names = [];
        for (const port of access.inputs.values()) { port.onmidimessage = e => midiMessage(port, e); names.push(port.name); }
        const field = names.some(n => /op-?1/i.test(n));
        $('midi').textContent = names.length ? 'MIDI: ' + names.join(', ') + (field ? ' · Field help key = shift, a tap = help' : '') : 'MIDI: nothing connected';
        $('midi').classList.toggle('ok', names.length > 0);
      };
      access.onstatechange = listen; listen();
    } catch (e) { $('midi').textContent = 'MIDI not allowed: play on screen.'; }
  }

  // ---- views, sequencer, tempo
  // Garden synth, Garden drum, or Sound (the synth's sound, shown as the synth's own pages on the same knobs)
  function setView(v) {
    view = v; store.set('view', v);
    if (v !== 'sound' && gardens[v] !== cur) {
      for (const id of [...taken.keys(), ...passed.keys()]) keyUp(id);
      const was = JSON.parse(M.UTF8ToString(M._gw_state(0))).page;   // the page the Garden left was on (T1-T4)
      cur = gardens[v]; M = cur.M; S = cur.S;
      const now = JSON.parse(M.UTF8ToString(M._gw_state(0)));
      if (was >= 0 && was < 4 && now.page !== was && !now.help) { M._gw_input(W.DOWN, K.t + was, 0, 0); M._gw_input(W.UP, K.t + was, 0, 0); }
    }
    document.querySelectorAll('.view').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $('screen').hidden = v === 'sound'; $('synth-screen').hidden = v !== 'sound';
    $('mixer').hidden = v !== 'sound'; document.body.classList.toggle('sound-up', v === 'sound');
    // both Gardens' pages stay up: a Garden takes keys only while its page is up, and the computer's keys reach the one
    // not shown too (q-i on the drum while the synth shows); which one the screen shows is the page's business
    for (const G of Object.values(gardens)) G.M._gw_show(1);
    if (isGarden()) { look = null; mount(drumLook()); }
    hint(isGarden() ? '' : 'T1 sound · T2 envelope · shift+T2 play · T3 fx · T4 lfo');
    caps(); lights(); lanes(); drawSynth();
  }
  // the sequencer key: both Gardens on or off together
  function setSeq(on) {
    seqOn = on;
    if (!on) { for (const id of [...taken.keys()]) keyUp(id); }
    for (const G of Object.values(gardens)) { G.M._gw_run(on ? 1 : 0); drain(synth.now(), G); }
    note('sequencer ' + (on ? 'on' : 'off'));
  }
  document.querySelectorAll('.view').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('bpm').value = bpm; $('bpm-out').textContent = bpm;
  $('bpm').oninput = () => { bpm = +$('bpm').value; $('bpm-out').textContent = bpm; synth.tempo(bpm); store.set('bpm', bpm); };
  synth.tempo(bpm);

  let hintTimer = 0;
  function hint(s) { $('hint').textContent = s; clearTimeout(hintTimer); if (s && isGarden()) hintTimer = setTimeout(() => { $('hint').textContent = ''; }, 3500); }

  // ---- Garden's words: the glossary card, and the words the coach and the explanations underline
  const WORDS = {
    'chord kind': 'The chord on the key you hold: maj, min, sus4, dim, aug, qrt (fourths), sus2, b5, pow (root and fifth), qnt (fifths), s24 and phr. Keys 1–4 choose from the live chord bank; each is a flower on the screen, a petal a note.',
    'pollinators': 'Notes added to the chord: 6, -7, +7, 9, b9, #9, #11, 13, 11, b13, #5 and 2. Keys 5–8 add or remove them, from the live extension bank; on the screen they are the creatures. One that is already in the chord adds nothing.',
    'banks': 'Two chord banks and two extension banks of four each. Keys 1–4 play the live chord bank, keys 5–8 the live extension bank. Push tan on T1 to swap the chord banks, orange to swap the extension banks; T3 edits them.',
    'style': 'How the chord is played: chord (all at once), strum (one note a step), strummm (over two octaves), slop (a strum, each note a little late), arp (one note a step, in an order), farp (an arp over two octaves), pattern (one of sixteen phrases) and harp (over three octaves, fast).',
    'rate': 'The length of a step: from two bars down to a thirty-second triplet. Shift + tan on T1.',
    'cascade': 'Blue on T1: lifts the chord\'s lowest note an octave for each step up, or drops its highest an octave for each step down. The same notes, climbing or falling.',
    'voicing': 'Gray on T1: how the notes are spread. close; drop2 and drop3 (the second or third from the top an octave down); open (every second note up an octave); shell (no fifth); spread (pairs of notes an octave apart).',
    'arp order': 'The order an arp or a strum runs through the notes: up, down, updown, downup, inside (lowest, highest, next lowest, next highest...) and random.',
    'phrase': 'With the pattern style: one of sixteen rhythms the chord\'s notes are played to.',
    'boost': 'Orange on T1: adds the root one or two octaves above (+) or below (-) the chord.',
    'boost pulse': 'Shift + orange on T1: strikes the Boost note, or the root, again and again at its own rate under the chord.',
    'echo': 'Shift + blue on T1: every note Garden plays comes back four times, each quieter, at the rate shown. Repeats never cut a note that still sounds.',
    'voice leading': 'Blue push on T1: each new chord takes the cascade whose notes lie nearest the last chord\'s, so chords move smoothly instead of jumping.',
    'latch': 'Gray push on T1: the chord keeps going after you let go: an arp, farp, pattern or harp repeats, a chord or strum rings on (or repeats, with the loop on). Another key replaces it. Press the same key again, or push gray, to let it go, the way the ending says. The gray chip shows latch is on.',
    'finishing': 'A chord let go plays to the end of its pass (an arp\'s line, a phrase, a looping strum\'s bar) before it stops, when the ending says finish. Push gray to cut it.',
    'ending': 'Shift + blue on T2: how a chord ends when let go. cut stops at once; finish plays to the end of the pass it is in (an arp\'s line, a phrase, a looping strum\'s bar); the root endings finish, then land on the root for a step, a quarter, a half or a bar.',
    'loop': 'Blue on T2: the pattern repeats while you hold. Off, it plays once.',
    'cycle': 'Shift + tan on T2: how often a pattern starts over. free: a line (arp, farp, pattern) runs at its own length, a looping strum every bar. 1/2 bar, 1 bar, 2 bars: a line starts again from its first note on that boundary, whatever its length, and a looping strum strikes once each. Here both Gardens start over on the same bar lines.',
    'downtime': 'Shift + gray on T2: what a line shorter than its cycle does once it has played: repeat (cut at the cycle\'s end), rest, or hold its last note to the cycle\'s end.',
    'length': 'Tan on T2: how long each note lasts, as a share of its step.',
    'swing': 'Gray on T2: every second step comes a little later.',
    'human': 'Orange on T2: each note a little quieter or louder, at random.',
    'gardens': 'T4: eight saved chords, each a root, a kind and up to four pollinators. Shift + a number key plants the chord now; a number key plays it.',
    'walk': 'Shift + blue push on T4: Garden plays the planted gardens in turn, each for the walk length, in the walk order.',
    'sow': 'Garden drum, Shift + gray push on T4: every empty garden gets a random key, kind and pollinators. Planted ones are kept.',
    'reap': 'Garden drum, Shift + orange push on T4: every garden emptied. A walk with no garden left ends, as the ending says.',
    'demos': 'The demo menu beside the tempo (here only, not in the pack): bloom, night, drift and run. Each plants four gardens in both Gardens and sets a style, rate, cycle and walk, a synth half and a drum half that play together. On T4, Shift + blue push walks them.',
    'drum mode': 'Garden drum\'s first mode, for a kit: a chord\'s notes are keys apart and wrap round the 24 keys, octaves land on the other half of the kit, and the styles take a drummer\'s names (hit, flam, drag, loose, roll, run, groove, sweep). Shift + tan push on T1 switches.',
    'melodic mode': 'Garden drum\'s second mode, for one sound laid a semitone a key: Garden plays real chords, folded onto the 24 keys. Shift + tan push on T1 switches.',
    'shift': 'Hold it (or tap it, for the next control) for each control\'s second layer: on T1 echo, rate, the other order and boost pulse; on T2 the ending.',
  };
  const w = (word, shown) => '<span class="term" data-term="' + word + '">' + (shown || word) + '</span>';
  (function glossary() {
    const dl = $('words');
    for (const [k, v] of Object.entries(WORDS)) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd);
    }
  })();

  // the coach: what is happening, and the most useful next thing to try, in a sentence or two
  const ENDS = {cut: 'stops at once', finish: 'finishes its pass, then stops', 'root step': 'finishes, then lands on the root for a step',
    'root 1/4': 'finishes, then lands on the root for a quarter', 'root 1/2': 'finishes, then lands on the root for a half', 'root bar': 'finishes, then lands on the root for a bar'};
  function coach() {
    let say;
    const g = S.g, n = S.names, v = S.view, onDrum = cur.kind === 'drum', drumMode = onDrum && S.kit;
    const shown = v.playing ? $('chord-word').textContent : (n.kinds[g.quality] || '');
    const end = ENDS[n.ending] || '';
    if (!ticking) say = 'Tap anywhere or press a key to start the sound.';
    else if (!isGarden()) say = 'Sound: the synth\'s own pages on the four knobs. T1 sound, T2 envelope, Shift + T2 play, T3 fx, T4 lfo. The bar above sets each Garden\'s level, the synth\'s mode (poly, mono, legato, unison) and the drum\'s kit.';
    else if (!seqOn) say = 'Garden is off (the Field\'s Sequencer key): the keys play the ' + cur.kind + ' alone. Press it again to turn Garden back on.';
    else if (S.help) say = 'Help shows what each knob turns and pushes on this page. Help again, or a T key, closes it.';
    else if (S.page === 0) {
      const latchDoes = g.loop || ['arp', 'farp', 'pattern', 'harp', 'roll', 'run', 'groove', 'sweep'].includes(n.style) ? 'it repeats' : 'it rings on';
      const after = {finish: 'stops', 'root step': 'lands on the root for a step', 'root 1/4': 'lands on the root for a quarter',
        'root 1/2': 'lands on the root for a half', 'root bar': 'lands on the root for a bar'}[n.ending] || 'stops';
      if (v.finishing) say = 'Letting go: ' + w('finishing') + ' the pass, then it ' + after + '.';
      else if (v.playing && g.hold) say = shown + ' is latched: ' + latchDoes + '. Press the same key again, or push gray, to let it go: it ' + end + ' (' + w('ending') + ', T2).';
      else if (g.hold && !v.playing) say = w('latch', 'Latch') + ' is on: hold a key, let go, and ' + latchDoes + '. Push gray to turn latch off.';
      else if (v.playing) say = 'Playing ' + shown + ' as ' + (/^[aeiou]/.test(n.style) ? 'an ' : 'a ') + n.style + ' at ' + n.rate + (n.cycle !== 'free' ? ', starting over every ' + n.cycle.replace(/^1 /, '') : '') + '. Keys 1–4 change the ' + w('chord kind') + ', 5–8 add ' + w('pollinators') + '; tan turns the ' + w('style') + ', blue the ' + w('cascade') + '. Let go and it ' + end + '.';
      else if (drumMode) say = 'Hold a key: Garden hits a ' + n.kinds[g.quality] + ' shape of keys from the one you hold, as ' + (/^[aeiou]/.test(n.style) ? 'an ' : 'a ') + n.style + ' (' + w('drum mode') + '). Keys 1–4 change the shape. Shift + tan push for ' + w('melodic mode') + '.';
      else say = 'Hold a key: Garden plays a ' + n.kinds[g.quality] + ' chord on it as ' + (/^[aeiou]/.test(n.style) ? 'an ' : 'a ') + n.style + ', in time. Keys 1–4 change the ' + w('chord kind') + ', 5–8 add ' + w('pollinators') + '. Push gray to ' + w('latch') + ' it.' + (onDrum ? ' This is ' + w('melodic mode') + '.' : '');
    } else if (S.page === 1) say = 'Rhythm: ' + w('loop') + ', ' + w('length') + ', ' + w('swing') + ' and ' + w('human') + '. With Shift: blue the ' + w('ending') + ' (now a chord let go ' + end + '), tan the ' + w('cycle') + ' (' + n.cycle + '), gray the ' + w('downtime') + ' (' + n.downtime + ').';
    else if (S.page === 2) say = 'Palette: the ' + w('banks') + ' that keys 1–8 choose from. Turn a knob to move its cursor, push to swap that cell for one not in use.';
    else say = w('gardens', 'Gardens') + ': a number key plays one, Shift + a number key plants the chord now. Shift + blue push to ' + w('walk') + ' them, or pick one of the ' + w('demos') + ' beside the tempo.' + (onDrum ? ' Shift + gray push to ' + w('sow') + ' the empty ones, Shift + orange push to ' + w('reap') + ' them all.' : '');
    if ($('coach').innerHTML !== say) $('coach').innerHTML = say;
  }

  // ---- what Garden is doing
  let S = null;
  const pct = v => v + '%';
  function knobValue(k) {
    if (!S) return '';
    const g = S.g, n = S.names, sh = shift();
    if (S.help) return '';
    if (S.page === 0) {
      if (k === 0) return sh ? n.echo : String(g.cascade);
      if (k === 1) return sh ? n.rate : n.style;
      if (k === 2) { const t = S.turn[2]; return t === 'phrase' ? n.phrase : t === 'arp order' ? n.order : n.voicing; }
      return sh ? n.pulse : n.boost;
    }
    if (S.page === 1) return sh ? [n.ending, n.cycle, n.downtime, ''][k] : [g.loop ? 'loop on' : 'loop off', pct(g.length), pct(g.swing), pct(g.human)][k];
    if (S.page === 3 && !sh) return k === 0 ? 'garden ' + (g.pad_sel + 1) : '';
    if (S.page === 3 && sh) return k === 0 ? n.walk_len : k === 1 ? n.walk_order : '';
    return '';
  }
  function lanes() {
    const el = $('lanes'); let html = '';
    for (let k = 0; k < 4; ++k) {
      let turn = '', push = '', val = '';
      if (isGarden()) { if (S) { turn = S.turn[k]; push = S.push[k]; val = knobValue(k); } }
      else { const key = SYNTH_PAGES[synthPage].keys[k], d = SYNTH_PARAMS[key]; turn = d.label; val = d.text ? d.text(synth.p[key]) : String(synth.p[key]); }
      html += '<div class="lane ' + KNOBS[k] + (turn ? '' : ' blank') + '"><span class="sw"></span><div><div class="turn">' + (turn || '—') +
        '</div>' + (val ? '<div class="val">' + val + '</div>' : '') + (push ? '<div class="push">' + push + '</div>' : '') + '</div></div>';
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  function explain() {
    S = cur.S = JSON.parse(M.UTF8ToString(M._gw_state(shift() ? 1 : 0)));
    if (isGarden()) mount(drumLook());                // Garden drum's look follows its mode
    lanes();
    const onDrum = cur.kind === 'drum';
    const rootName = r => onDrum ? 'key ' + (keyOf(r) + 1) : NOTE[r % 12];
    const g = S.g, n = S.names, v = S.view;
    const kind = n.kinds[v.playing ? v.kind : g.quality] || '';
    const ext = n.pollen.filter((_, e) => ((v.playing ? v.mask : g.extensions) >> e) & 1).join(' ');
    const word = (v.playing ? rootName(v.root) + ' ' : '') + kind + (ext ? ' ' + ext : '');
    $('chord-word').textContent = word || '—'; $('chord-word').classList.toggle('quiet', !v.playing);
    let chips = '';
    for (let i = 0; i < 4; ++i) { const e = g.extsets[g.pf * 4 + i]; chips += '<span class="chip' + ((g.extensions >> e) & 1 ? ' on' : '') + '">' + n.pollen[e] + '</span>'; }
    for (const x of v.notes) chips += '<span class="chip note">' + (onDrum ? drum.keyName(keyOf(x)) : noteName(x)) + '</span>';
    if ($('chips').innerHTML !== chips) $('chips').innerHTML = chips;
    for (let i = 0; i < 8; ++i) {
      let label = '', live = false;
      if (S.page === 3 && !S.help) { const used = g.pad_used[i] && g.seed_q[i] < 12; label = used ? rootName(g.pad_root[i]) + ' ' + n.kinds[g.seed_q[i]] : 'empty'; live = used; }
      else if (i < 4) { const q = g.kinds[g.fl * 4 + i]; label = n.kinds[q]; live = q === g.quality; }
      else { const e = g.extsets[g.pf * 4 + i - 4]; label = n.pollen[e]; live = !!((g.extensions >> e) & 1); }
      const s = $$num[i].querySelector('small');
      if (s.textContent !== label) s.textContent = label;
      $$num[i].classList.toggle('live', live);
    }
    const rows = [
      ['page', S.help ? 'help' : PAGES[S.page]], ['sequencer', S.on ? 'on' : 'off'],
      onDrum ? ['drum', drum.kits[drum.kit].name + ', ' + (S.kit ? 'drum mode' : 'melodic mode')] : ['synth plays', synth.mono() ? 'mono' : 'poly'],
      ['style', n.style], ['rate', n.rate], ['cascade', g.cascade], ['echo', n.echo], ['voicing', n.voicing], ['arp order', n.order],
      ['phrase', n.phrase], ['boost', n.boost], ['boost pulse', n.pulse], ['voice leading', g.lead ? 'on' : 'off'], ['latch', g.hold ? 'on' : 'off'],
      ['loop', g.loop ? 'on' : 'off'], ['cycle', n.cycle], ['downtime', n.downtime], ['ending', n.ending], ['length', pct(g.length)], ['swing', pct(g.swing)], ['human', pct(g.human)],
      ['kind', n.kinds[g.quality]], ['chord bank', g.fl ? 'b' : 'a'], ['extension bank', g.pf ? 'b' : 'a'],
      ['extensions', n.pollen.filter((_, e) => (g.extensions >> e) & 1).join(', ') || 'none'],
      ['chord bank a', g.kinds.slice(0, 4).map(q => n.kinds[q]).join(', ')], ['chord bank b', g.kinds.slice(4).map(q => n.kinds[q]).join(', ')],
      ['extension bank a', g.extsets.slice(0, 4).map(e => n.pollen[e]).join(', ')], ['extension bank b', g.extsets.slice(4).map(e => n.pollen[e]).join(', ')],
      ['garden', g.pad_sel + 1], ['extension square', g.square + 1], ['walk length', n.walk_len], ['walk order', n.walk_order],
    ];
    const html = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
    if ($('settings').innerHTML !== html) $('settings').innerHTML = html;
    coach();
  }

  // ---- what each control is for: on hover (a mouse), and on a tap while "?" is on (a tap then explains, not plays);
  // a word of Garden's underlined anywhere explains itself on hover or tap
  const PAGE_TIP = ['T1 play: the chord and how it is played (style, cascade, voicing, Boost), and Hold.',
    'T2 rhythm: loop, length, swing and human; with Shift, the ending.',
    'T3 palette: the two chord banks and two extension banks that keys 1–8 choose from.',
    'T4 gardens: eight saved chords to play, plant and walk.'];
  const SOUND_PAGE_TIP = ['T1: the sound (wave, detune, cutoff, resonance).', 'T2: the envelope; with Shift, play (mode, portamento, spread, env to filter).',
    'T3: fx (delay time, feedback, mix; reverb).', 'T4: the lfo (rate, depth, target, shape).'];
  const TAB_TIP = {synth: 'Garden synth: Garden playing the synth.', drum: 'Garden drum: Garden playing the drum, a kit over 24 keys, in drum or melodic mode.',
    sound: 'Sound: the synth\'s sound on the knobs. Both Gardens keep playing.'};
  const gloss = word => WORDS[word] ? ' ' + WORDS[word] : '';
  function tipFor(el) {
    const term = el.closest('.term');
    if (term) return WORDS[term.dataset.term] || '';
    const knob = el.closest('[data-knob]');
    if (knob) {
      const k = +knob.dataset.knob, name = KNOBS[k][0].toUpperCase() + KNOBS[k].slice(1) + ' knob';
      if (!isGarden()) { const key = SYNTH_PAGES[synthPage].keys[k], d = SYNTH_PARAMS[key]; return name + ': ' + d.label + ', now ' + (d.text ? d.text(synth.p[key]) : synth.p[key]) + '. Turn it to change.'; }
      if (!S || !S.turn[k]) return name + ': nothing on this page.';
      return name + ': turn for ' + S.turn[k] + (knobValue(k) ? ' (now ' + knobValue(k) + ')' : '') + '.' + gloss(S.turn[k]) + (S.push[k] ? ' ' + S.push[k][0].toUpperCase() + S.push[k].slice(1) + '.' : '');
    }
    const ctl = el.closest('[data-control]');
    if (ctl) {
      const c = ctl.dataset.control;
      if (c === 'help') return 'Help: what each knob turns and pushes on this page. A tap keeps it open; held, it goes when you let go.';
      if (c === 'shift') return 'Shift:' + gloss('shift');
      const i = +c.slice(1);
      return isGarden() ? PAGE_TIP[i] : SOUND_PAGE_TIP[i];
    }
    const num = el.closest('.num');
    if (num) {
      const i = $$num.indexOf(num), label = num.querySelector('small').textContent;
      if (S && S.page === 3 && !S.help) return 'Key ' + (i + 1) + ': garden ' + (i + 1) + (label && label !== 'empty' ? ', ' + label : ', empty') + '. A tap plays it; Shift + the key plants the chord now.';
      if (i < 4) return 'Key ' + (i + 1) + ': the chord kind ' + label + '. A tap chooses it; hold it 300 ms or more and it goes back when you let go.' + gloss('chord kind');
      return 'Key ' + (i + 1) + ': the pollinator ' + label + ', added or taken away. A tap latches it; hold it 300 ms or more and it goes back when you let go.' + gloss('pollinators');
    }
    const key = el.closest('.piano > div');
    if (key) {
      const k = +key.dataset.k;
      return (cur.kind === 'drum' ? 'Drum key ' + (k + 1) + ' (' + drum.keyName(k) + '). ' : 'Key ' + noteName(53 + k + 12 * octave) + '. ') +
        'The first key held plays Garden\'s chord on it; further keys play single notes over it.';
    }
    if (el.closest('#oct-down, #oct-up')) return 'The octave: moves the keys down or up. On the drum it moves which notes the keys send.';
    if (el.closest('.tempo')) return 'The tempo both Gardens play to.';
    const tab = el.closest('.view');
    if (tab) return TAB_TIP[tab.dataset.view];
    if (el.closest('#mix-synth')) return 'Garden synth\'s level.';
    if (el.closest('#mix-drum')) return 'Garden drum\'s level.';
    if (el.closest('#kit')) return 'The drum\'s kit: 808, 909 and 808 + 909 play in drum mode; the melodic kits (one sound a semitone a key) play in melodic mode.';
    return '';
  }
  const TIPPED = '.term, [data-knob], [data-control], .num, .piano > div, #oct-down, #oct-up, .tempo, .view, #mix-synth, #mix-drum, #kit';
  let explaining = false, tipEl = null, tipTimer = 0;
  function showTip(el) {
    const text = tipFor(el);
    if (!text) return hideTip();
    tipEl = el;
    const t = $('tip');
    t.textContent = text; t.hidden = false;
    const r = el.getBoundingClientRect(), tw = Math.min(340, innerWidth - 24);
    t.style.width = tw + 'px';
    t.style.left = Math.max(12, Math.min(innerWidth - tw - 12, r.left + r.width / 2 - tw / 2)) + 'px';
    const below = r.bottom + 8, h = t.offsetHeight;
    t.style.top = (below + h < innerHeight - 8 ? below : Math.max(8, r.top - h - 8)) + 'px';
  }
  function hideTip() { clearTimeout(tipTimer); tipEl = null; $('tip').hidden = true; }
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || explaining) return;
    const el = e.target.closest && e.target.closest(TIPPED);
    clearTimeout(tipTimer);
    if (!el) { if (tipEl) hideTip(); return; }
    if (el === tipEl) return;
    tipTimer = setTimeout(() => showTip(el), 450);
  });
  document.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && !explaining && tipEl && !tipEl.contains(e.relatedTarget)) hideTip(); });
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    document.addEventListener(type, e => {
      const el = e.target.closest && e.target.closest(TIPPED);
      if (el && el.closest('.term')) { if (type === 'pointerdown') showTip(el); return; }
      if (e.target.closest && e.target.closest('#explain')) return;
      if (!explaining) { if (type === 'pointerdown' && tipEl && !el) hideTip(); return; }
      if (!el) { if (type === 'pointerdown') hideTip(); return; }
      e.preventDefault(); e.stopPropagation();
      if (type === 'pointerdown') showTip(el);
    }, true);
  }
  // on a narrow screen the side comes after the whole device: the coach goes under the screen, where it is read while
  // playing; wide, it heads the side
  const narrow = matchMedia('(max-width: 980px)');
  function placeCoach() {
    const c = $('coach');
    document.querySelector('.screen-wrap').after(c);      // under the screen, read while playing
    c.classList.add('in-device');
  }
  narrow.addEventListener ? narrow.addEventListener('change', placeCoach) : narrow.addListener(placeCoach);
  placeCoach();
  $('explain').onclick = () => {
    explaining = !explaining;
    $('explain').classList.toggle('on', explaining); $('explain').setAttribute('aria-pressed', String(explaining));
    document.body.classList.toggle('explaining', explaining);
    hideTip();
    hint(explaining ? 'Tap any control to see what it does. ? again to play.' : '');
  };
  window.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });

  // ---- the roll: two bars of what sounded, Garden's notes filled, the instrument's outlined
  const rc = $('roll'), rx = rc.getContext('2d');
  function drawRoll() {
    const now = synth.now(), span = 2 * 4 * 60 / bpm, t0 = now - span, W2 = rc.width, H = rc.height;
    while (roll.length && roll[0].t1 && roll[0].t1 < t0) roll.shift();
    if (roll.length > 600) roll.splice(0, roll.length - 600);
    rx.fillStyle = '#141618'; rx.fillRect(0, 0, W2, H);
    let lo = 127, hi = 0;
    for (const r of roll) { if (r.g !== cur.kind) continue; lo = Math.min(lo, r.note); hi = Math.max(hi, r.note); }
    if (lo > hi) { lo = 48; hi = 72; }
    lo = Math.min(lo, hi - 12) - 2; hi += 2;
    const beat = 60 / bpm, first = Math.ceil(t0 / beat) * beat;
    for (let t = first, i = Math.round(first / beat); t < now; t += beat, ++i) {
      const x = (t - t0) / span * W2;
      rx.fillStyle = i % 4 === 0 ? '#3a3f44' : '#24282b'; rx.fillRect(x, 0, i % 4 === 0 ? 2 : 1, H);
    }
    const rowH = Math.max(3, Math.min(14, (H - 8) / (hi - lo + 1)));
    for (const r of roll) {
      if (r.g !== cur.kind) continue;                 // the roll of the Garden shown
      const a = Math.max(r.t0, t0), b = r.t1 || now; if (b < t0) continue;
      const x = (a - t0) / span * W2, w = Math.max(3, (b - a) / span * W2);
      const y = H - 4 - (r.note - lo + 1) * (H - 8) / (hi - lo + 1);
      if (r.src === 'g') { rx.fillStyle = 'rgba(229,40,23,' + (0.45 + 0.55 * r.vel / 127) + ')'; rx.fillRect(x, y, w, rowH - 1); }
      else { rx.strokeStyle = '#cdd0c2'; rx.lineWidth = 2; rx.strokeRect(x + 1, y + 1, w - 2, rowH - 3); }
    }
  }

  // ---- the synth's own pages, drawn as values in their knobs' colours
  const sc = $('synth-screen'), sx = sc.getContext('2d');
  const KCOL = ['#3C6087', '#8A653C', '#CDD0C2', '#E52817'], KINK = ['#7aa6d2', '#c9a273', '#e2e4da', '#ff6a57'];
  function drawSynth() {
    if (view !== 'sound') return;                      // the Sound tab's pages
    const P = SYNTH_PAGES[synthPage], p = synth.p;
    sx.fillStyle = '#000'; sx.fillRect(0, 0, 960, 440);
    sx.fillStyle = '#fff'; sx.font = '700 44px system-ui, sans-serif'; sx.textBaseline = 'top'; sx.fillText(P.name, 32, 24);
    if (P.name === 'envelope') {
      const a = envTime(p.attack), d = envTime(p.decay), r = envTime(p.release), s = p.sustain / 100, tot = a + d + r + 0.6;
      const x0 = 40, w = 880, y0 = 380, h = 250, X = t => x0 + t / tot * w;
      sx.lineWidth = 6; sx.lineJoin = 'round';
      const pts = [[0, 0], [a, 1], [a + d, s], [a + d + 0.6, s], [tot, 0]];
      for (let i = 0; i < 4; ++i) { sx.strokeStyle = KCOL[i]; sx.beginPath(); sx.moveTo(X(pts[i][0]), y0 - pts[i][1] * h); sx.lineTo(X(pts[i + 1][0]), y0 - pts[i + 1][1] * h); sx.stroke(); }
      return;
    }
    for (let k = 0; k < 4; ++k) {
      const key = P.keys[k], d = SYNTH_PARAMS[key], x = 32 + k * 228, v = p[key];
      sx.fillStyle = KCOL[k];
      if (d.steps) {
        sx.fillStyle = KINK[k]; sx.font = '700 40px system-ui, sans-serif'; sx.fillText(d.text(v), x, 210); sx.fillStyle = KCOL[k];
        for (let i = 0; i < d.steps; ++i) { sx.globalAlpha = i === v ? 1 : 0.3; sx.fillRect(x + i * 30, 300, 22, 22); }
        sx.globalAlpha = 1;
      } else {
        const f = v / d.max; sx.globalAlpha = 0.25; sx.fillRect(x, 130, 60, 230); sx.globalAlpha = 1; sx.fillRect(x, 130 + 230 * (1 - f), 60, 230 * f);
      }
      sx.fillStyle = '#a3a7a0'; sx.font = '400 26px system-ui, sans-serif'; sx.fillText(d.label, x, 384);
    }
  }

  // ---- the frame: the page's frame function, its picture, the explanations; the settings kept as the unit keeps them
  let frames = 0;
  function frame(t) {
    for (const G of Object.values(gardens)) {         // both Gardens' frames: each keeps its own settings file
      G.M._gw_frame(Math.floor(t) >>> 0, shift() ? 1 : 0);
      drain(synth.now(), G);
      const w = G.M._gw_file_writes();
      if (w !== G.fileWrites) {
        G.fileWrites = w;
        const len = G.M._gw_file_len();
        if (len > 0) store.set(G.kind === 'synth' ? 'file' : 'file-drum', b64.from(G.M.HEAPU8.subarray(G.M._gw_file(), G.M._gw_file() + len)));
      }
    }
    if (isGarden()) paint();
    if ((frames++ & 3) === 0) explain();
    drawRoll();
    requestAnimationFrame(frame);
  }

  // ---- links and reports
  function stateLink() {
    const settings = G => b64.from(G.M.HEAPU8.subarray(G.M._gw_g(), G.M._gw_g() + SETTINGS));
    const q = new URLSearchParams({g: settings(gardens.synth), gd: settings(gardens.drum), s: btoa(JSON.stringify(synth.p)), bpm: String(bpm),
      v: view, k: String(drum.kit), mix: JSON.stringify(mix)});
    return location.origin + location.pathname + '#' + q.toString();
  }
  function toast(s) { $('toast').textContent = s; setTimeout(() => { if ($('toast').textContent === s) $('toast').textContent = ''; }, 4000); }
  $('share').onclick = async () => {
    const link = stateLink();
    try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch (e) { prompt('Copy this link', link); }
  };
  $('reset').onclick = () => { store.clear(); location.replace(location.pathname); };
  $('report').onclick = () => $('report-dlg').showModal();
  $('report-form').addEventListener('submit', e => {
    if (e.submitter && e.submitter.value !== 'open') return;
    const n = S ? S.names : {}, g = S ? S.g : {};
    const did = $('r-did').value.trim(), web = $('r-web').value.trim(), unit = $('r-unit').value.trim();
    const lines = [
      '**Garden ' + build.garden + '** · pack `' + (build.pack || '').slice(0, 12) + '` · ' + navigator.userAgent.replace(/[()]/g, ''),
      '', '**What I played**', did || '_not said_', '', '**On the web**', web || '_not said_', '', '**On the unit**', unit || '_not said_', '',
      '**State**', '', '[Play this state on the web](' + stateLink() + ')', '',
      '- page ' + (S ? (S.help ? 'help' : PAGES[S.page]) : '?') + ', sequencer ' + (seqOn ? 'on' : 'off') + ', tempo ' + bpm,
      '- ' + [n.style, n.rate, 'cascade ' + g.cascade, n.echo, n.voicing, n.order, n.phrase, n.boost, n.pulse].join(', '),
      '- latch ' + (g.hold ? 'on' : 'off') + ', voice leading ' + (g.lead ? 'on' : 'off') + ', loop ' + (g.loop ? 'on' : 'off') +
        ', length ' + g.length + '%, swing ' + g.swing + '%, human ' + g.human + '%',
      '- Garden ' + cur.kind + (cur.kind === 'drum' ? ', kit ' + drum.kits[drum.kit].name + ', ' + (S && S.kit ? 'drum mode' : 'melodic mode') : '') +
        ', synth ' + SYNTH_PARAMS.mode.text(synth.p.mode) + ', portamento ' + SYNTH_PARAMS.portamento.text(synth.p.portamento),
      '- garden.bin `' + b64.from(M.HEAPU8.subarray(M._gw_g(), M._gw_g() + SETTINGS)) + '`',
      '', '<details><summary>Last inputs</summary>', '', log.slice(-40).join(' · '), '', '</details>',
    ];
    let body = lines.join('\n');
    if (body.length > 6500) body = body.slice(0, 6500);
    const title = 'Web and unit differ: ' + (did || 'Garden').slice(0, 60);
    window.open('https://github.com/' + REPO + '/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body), '_blank', 'noopener');
  });

  // ---- the mix: each Garden's level, and Garden drum's kit (a kit of drums puts it in drum mode, a melodic one in melodic)
  let drumTap = null;
  function applyMix() {
    if (!ticking) return;
    synth.volume.volume.value = mix.synth;
    drumTap.gain.value = Math.pow(10, mix.drum / 20);
  }
  const dB = x => (x > 0 ? '+' : '') + x + ' dB';
  for (const kind of ['synth', 'drum']) {
    const r = $('mix-' + kind), v = $('mix-' + kind + '-v');
    r.value = mix[kind]; v.textContent = dB(mix[kind]);
    r.oninput = () => { mix[kind] = +r.value; v.textContent = dB(mix[kind]); store.set('mix', JSON.stringify(mix)); applyMix(); };
  }
  drum.kits.forEach((k, i) => { const o = document.createElement('option'); o.value = i; o.textContent = k.name + (k.pitched ? ' · melodic' : ''); $('kit').appendChild(o); });
  $('kit').value = String(drum.kit);
  // demos, beside the tempo: both Gardens' halves at once; a drum half wants a kit of drums
  for (let i = 0; i < M._gw_demos(); ++i) { const o = document.createElement('option'); o.value = i; o.textContent = M.UTF8ToString(M._gw_demo_name(i)); $('demo').appendChild(o); }
  $('demo').onchange = () => {
    const i = +$('demo').value;
    if (i < 0) return;
    for (const G of Object.values(gardens)) { G.M._gw_demo(i); drain(synth.now(), G); }
    if (drum.kits[drum.kit].pitched) { drum.setKit(0); $('kit').value = '0'; store.set('kit', '0'); }
    note('demo ' + $('demo').selectedOptions[0].textContent);
    hint('Demo ' + $('demo').selectedOptions[0].textContent + ': on T4, Shift + blue push walks its gardens.');
    $('demo').value = '-1';
  };
  // the synth's mode (poly, mono, legato, unison), also on Sound's play page (Shift + T2, blue)
  MODES.forEach((m, i) => { const o = document.createElement('option'); o.value = i; o.textContent = m; $('synth-mode').appendChild(o); });
  $('synth-mode').value = String(synth.p.mode);
  $('synth-mode').onchange = () => {
    synth.set('mode', +$('synth-mode').value); gardens.synth.M._gw_mono(synth.mono() ? 1 : 0);
    store.set('synth2', btoa(JSON.stringify(synth.p))); lanes(); drawSynth(); note('synth mode ' + MODES[synth.p.mode]);
  };
  function modeForKit() {                             // Shift + tan push on T1, on Garden drum, when the mode is not the kit's
    const D = gardens.drum.M, want = drum.kits[drum.kit].pitched ? 0 : 1, st = JSON.parse(D.UTF8ToString(D._gw_state(0)));
    if (st.kit === want) return;
    D._gw_input(W.DOWN, K.t, 0, 0); D._gw_input(W.UP, K.t, 0, 0);
    D._gw_input(W.DOWN_SHIFT, K.click + 1, 0, 1); D._gw_input(W.UP, K.click + 1, 0, 1);
    if (st.page > 0 && st.page < 4) { D._gw_input(W.DOWN, K.t + st.page, 0, 0); D._gw_input(W.UP, K.t + st.page, 0, 0); }
  }
  $('kit').onchange = () => {
    drum.setKit(+$('kit').value); store.set('kit', String(drum.kit)); modeForKit();
    note('kit ' + drum.kits[drum.kit].name);
  };
  $('credits').textContent = 'Garden drum plays ' + drum.credits;

  // ---- sound starts with the first touch or key anywhere, which then does what it does; until the browser lets the
  // sound run, each touch asks again (iOS lets it run from a touch's end, not its start)
  function begin() {
    if (!ticking) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      synth.start();
      try { Tone.getContext().lookAhead = 0.02; } catch (e) {}
      const ctx = Tone.getContext().rawContext;
      drumTap = ctx.createGain(); Tone.connect(drumTap, synth.limiter); drum.start(ctx, drumTap);
      nextTick = synth.now() + 0.05; ticking = true;
      applyMix();
    }
    try { Tone.start(); } catch (e) {}
    if (Tone.getContext().state === 'running') for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.removeEventListener(t, begin, true);
  }
  for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(t, begin, true);
  setSeq(seqOn);
  setTimeout(modeForKit, 300);                        // once Garden drum's page has had its first frames
  setView(view);
  midi();
  requestAnimationFrame(frame);
  window.GARDEN = {get M() { return M; }, gardens, drum, synth, state: () => S, link: stateLink, input, keyDown, keyUp, begin, setView,
    midi: (name, bytes) => midiMessage({name, id: name}, {data: bytes})};
})();
