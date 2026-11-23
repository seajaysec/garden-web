# garden-web

**Play it: [seajaysec.github.io/garden-web](https://seajaysec.github.io/garden-web/)**

Garden in a browser: the Garden pack's public sources ([garden-op1f](https://github.com/seajaysec/garden-op1f):
`garden.cpp` and `articulate.cpp`) compiled to WebAssembly, its screen
picture posed live, a six-voice synth (Tone.js) and a drum of X0X's 909 and 808 voices. It installs as a home-screen
app and works offline. GPL-3.0, for the drum voices (see [NOTICE](NOTICE)); the pack itself is MIT.

## Build

```sh
(cd ../garden-op1f && ./build.sh)   # the pack, its picture parts and open-field's headers
./web.sh            # out/
./web.sh serve      # and serve it on a free local port
./web.sh pages      # and copy it to docs/, the site GitHub Pages serves
node test.mjs       # every key of every kit rendered by the drum engines
```

`GARDEN=<path>` builds from a garden-op1f checkout elsewhere. Reports go to garden-op1f: they are about the pack.

## Play

- **Garden synth · Garden drum · Sound.** Two Gardens, each its own engine and settings, on one clock and one tempo:
  Garden synth plays the synth, Garden drum the drum, and both can play at once. Their steps fall on the clock's
  grid (each at its own rate), so their bars line up whenever each key went down. Sound is the synth's own pages on the knobs
  (T1 sound, T2 envelope, Shift+T2 play, T3 fx, T4 lfo).
- **Garden drum** has two modes, Shift + tan push on T1: **melodic** (Garden as on the synth, for a sample laid a
  semitone a key) and **drum** (the drum theme, a drummer's style names, octaves on the other half of the kit). A kit
  sets the mode when picked: 808, 909 and 808 + 909 drum, the melodic kits melodic.
- **The mix card:** each Garden's level and the drum's kit.
- **Sound starts at the first touch or key.**
- **The computer's keys** (by their place, so Shift does not change them):

  | | Garden synth | Garden drum |
  | --- | --- | --- |
  | Number keys 1 to 8 | `1`–`8` | `q`–`i` |
  | T1 to T4 | `a s d f` | `h j k l` |
  | Knob pushes | `z x c v` | `n m , .` |

  Shift is shift, `/` help, the arrows the octave. `` ` `` swaps them for a piano on the Garden shown
  (`a w s e d f t g y h u j k o l p ;` from middle C) and back. The caps beside the controls show once keys are used.
- **MIDI:** a Field in MIDI controller mode (knobs relative) drives the Garden shown, its Help key held as Shift and a
  tap as Help; any MIDI keyboard plays it.

## What is where

| Path | What |
| --- | --- |
| `web/` | The page: `app.js`, `synth.js`, `style.css`, the worker, the manifest, Tone.js |
| `tools/web.cpp`, `tools/host_world.h` | The base's calls and the unit's words as stand-ins around the pack's `garden.cpp` |
| `drums.c`, `drum.js` | The drum: one hit of a 909 or 808 voice at a time, and the kits that lay them over the 24 keys |
| `x0x/` | X0X's drum engines and samples, unchanged (NOTICE) |
| `web.sh` | All of it into `out/` |
