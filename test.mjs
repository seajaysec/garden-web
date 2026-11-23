// node test.mjs (after ./web.sh): every kit's every key rendered by the engines (out/drums.js), as drum.js renders them. Fails on a
// pot name its voice does not have, a hit that is silent or not finite, or a peak past 1 after the machine's gain.
import fs from 'fs';
globalThis.window = globalThis;
new Function(fs.readFileSync('out/drums.js', 'utf8') + '\nglobalThis.GardenDrums = GardenDrums;')();
new Function(fs.readFileSync('drum.js', 'utf8'))();
const {KITS, GAIN, VEL} = window.GardenDrumKits;
const M = await GardenDrums(), name = M._malloc(16);
let bad = 0, hits = 0, top = 0;
for (const kit of KITS) for (const spec of kit.pitched ? [kit.pitched] : kit.keys) for (const accent of [0, 1]) {
  M._dr_begin(spec.e);
  for (const [p, v] of Object.entries(spec.pots)) {
    M.stringToUTF8(p, name, 16);
    if (M._dr_set(spec.v, name, v) < 0) { console.log(`FAIL ${kit.name} ${spec.label}: no pot '${p}'`); ++bad; }
  }
  const n = M._dr_render(spec.v, VEL[spec.e][accent], 44100 * 6), at = M._dr_out() >> 2;
  let pk = 0, finite = true;
  for (let i = 0; i < n; ++i) { const x = M.HEAPF32[at + i] * GAIN[spec.e]; if (!Number.isFinite(x)) finite = false; else pk = Math.max(pk, Math.abs(x)); }
  ++hits; top = Math.max(top, pk);
  if (!finite || pk < 0.01 || pk > 1) { console.log(`FAIL ${kit.name} ${spec.label}${accent ? ' accent' : ''}: peak ${pk.toFixed(3)}${finite ? '' : ', not finite'}`); ++bad; }
}
console.log(bad ? `${bad} failed of ${hits} hits` : `ok: ${hits} hits in ${KITS.length} kits, the loudest peak ${top.toFixed(2)}`);
process.exit(bad ? 1 : 0);
