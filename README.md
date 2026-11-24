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
  Garden synth plays the synth, Garden drum the drum, and both play at once. Switching between them keeps the page
  you were on (T1 to T4). Sound is the synth's own pages on the knobs (T1 sound, T2 envelope, Shift + T2 play, T3 fx,
  T4 lfo), with each Garden's level (the synth at -18 dB, the drum at +4 dB), the synth's mode (poly, mono, legato,
  unison) and the drum's kit in the bar beside the tempo.
- **In time together.** Here a chord starts on the clock's next 1/16, its steps fall on the clock's grid at its own
  rate, the cycle starts over on the shared bar lines (1 bar unless set), and a walk changes chords on its own
  length's lines, so the two Gardens line up however their keys went down. (On the unit a chord starts at the key.)
- **Demos** (the buttons beside the tempo, here only): bloom, night, drift and run. A tap plants four gardens in both
  Gardens, sets a style, rate, cycle and walk (a synth half and a drum half laid for the 808) and walks both at once,
  in time; the lit one tapped again stops them.
- **A new version** is offered with a notice once the sound runs, rather than reloading the page under you.
- **Garden drum** starts in drum mode (the drum theme, a drummer's style names, octaves on the other half of the
  kit); Shift + tan push on T1 switches to melodic mode (Garden as on the synth, for a sample laid a semitone a key).
  A kit sets the mode when picked: 808, 909 and 808 + 909 drum, the melodic kits melodic.
- **Learning it.** The coach, under the screen, says what is happening and what to try next. **?** makes a tap
  explain a control instead of playing it (a mouse explains on hover). **Garden's words** explains each of Garden's
  terms, and the coach underlines them. **Computer keys** lists the keys.
- **Sound starts at the first touch or key.** A Field's own Sequencer key (MIDI) switches Garden off and on.
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
- **The pack** for an OP-1 Field, and its source: [garden-op1f](https://github.com/seajaysec/garden-op1f).

## What is where

| Path | What |
| --- | --- |
| `web/` | The page: `app.js`, `synth.js`, `style.css`, the worker, the manifest, Tone.js |
| `tools/web.cpp`, `tools/host_world.h` | The base's calls and the unit's words as stand-ins around the pack's `garden.cpp` |
| `drums.c`, `drum.js` | The drum: one hit of a 909 or 808 voice at a time, and the kits that lay them over the 24 keys |
| `x0x/` | X0X's drum engines and samples, unchanged (NOTICE) |
| `web.sh` | All of it into `out/` |
