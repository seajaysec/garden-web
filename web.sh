#!/bin/sh
# Build out/: Garden in a browser. The engine is the Garden pack's public sources (garden-op1f: garden.cpp and
# articulate.cpp) as they are, compiled to WebAssembly by tools/web.cpp with tools/host_world.h; the screen is the
# pack's own picture (garden.svg.make); the drum is X0X's 909 and 808 (x0x/, drums.c) with the kits of drum.js; the
# page is web/.
#   ./web.sh            build (garden-op1f beside this checkout, or GARDEN=<its path>)
#   ./web.sh serve      build, then serve out/ on a free local port
#   ./web.sh pages      build, then copy out/ to docs/, the site GitHub Pages serves
# Needs emcc, python3, rsvg-convert, and one ./build.sh in garden-op1f (open-field's headers, the picture and the pack).
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$ROOT"
GP="${GARDEN:-$ROOT/../garden-op1f}"
CARD="$GP/.build/open-field/module/build_r6e_card.h"
[ -f "$GP/garden_parts.h" ] && [ -f "$GP/garden.svg.make" ] && [ -f "$CARD" ] && [ -f "$GP/out/garden.pack" ] ||
  { echo "run ./build.sh in $GP first" >&2; exit 1; }
OUT=out GEN=.build
rm -rf "$OUT"; mkdir -p "$OUT/vendor" "$OUT/icons" "$GEN/hostinc"
sed '/static_assert/,/;/d' "$CARD" > "$GEN/hostinc/build_r6e_card.h"   # the card header asserts 32-bit sizes
emcc -O2 -std=gnu++11 -DOP1F_HOST -DGARDEN_HOST -w -I. -I"$GEN/hostinc" -I"$GP" tools/web.cpp "$GP/articulate.cpp" \
  -sSINGLE_FILE=1 -sMODULARIZE=1 -sEXPORT_NAME=GardenEngine -sENVIRONMENT=web,worker -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS=_gw_file,_gw_file_set,_gw_file_len,_gw_file_writes,_gw_settings_bytes,_gw_g,_gw_show,_gw_mono,_gw_run,_gw_instrument,_gw_demos,_gw_demo_name,_gw_demo,_gw_walk_stop,_gw_frame,_gw_tick,_gw_key,_gw_input,_gw_notes,_gw_note,_gw_notes_clear,_gw_part_count,_gw_parts,_gw_text_count,_gw_text,_gw_text_x,_gw_text_y,_gw_text_align,_gw_state \
  -sEXPORTED_RUNTIME_METHODS=UTF8ToString,HEAPU8,HEAP32 -o "$OUT/engine.js"
python3 -I x0x/tools/gen_drum_samples.py "$GEN/x0x_drum_samples.h" >/dev/null
emcc -O2 -std=c99 -Wall -Werror -I x0x -I "$GEN" drums.c x0x/drum909.c x0x/drum808.c \
  -sSINGLE_FILE=1 -sMODULARIZE=1 -sEXPORT_NAME=GardenDrums -sENVIRONMENT=web,worker -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS=_dr_out,_dr_voices,_dr_begin,_dr_set,_dr_render,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32,stringToUTF8 -o "$OUT/drums.js"
python3 -I - "$OUT" "$GP" <<'PY'
import hashlib, json, os, sys
out, gp = sys.argv[1], sys.argv[2]
data = open(os.path.join(gp, "garden.svg.make"), "rb").read()
at = data.index(b"\na ") + 3
n = int(data[at:data.index(b"\n", at)])
body = data[data.index(b"\n", at) + 1:][:n].decode()
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 220" width="480" height="220">'
       '<rect width="480" height="220" fill="#000"/>' + body + '</svg>')
open(os.path.join(out, "screen.svg"), "w").write(svg)
recipe = json.load(open(os.path.join(gp, "recipe.json")))
pack = open(os.path.join(gp, "out/garden.pack"), "rb").read()
json.dump({"garden": recipe["version"], "pack": hashlib.sha256(pack).hexdigest()}, open(os.path.join(out, "build.json"), "w"))
PY
cp web/index.html web/app.js web/synth.js web/style.css web/manifest.webmanifest drum.js LICENSE NOTICE "$OUT/"
cp web/vendor/Tone.js web/vendor/Tone.js.LICENSE.txt "$OUT/vendor/"
for s in 180 192 512; do rsvg-convert -w $s -h $s web/icon.svg -o "$OUT/icons/icon-$s.png"; done
cp web/icon.svg "$OUT/icons/icon.svg"
STAMP=$(cd "$OUT" && cat engine.js drums.js drum.js app.js synth.js style.css index.html screen.svg build.json | shasum -a 256 | cut -c1-12)
sed "s/__BUILD__/$STAMP/" web/sw.js > "$OUT/sw.js"
sed -i '' -E "s/(href|src)=\"(style\.css|vendor\/Tone\.js|engine\.js|drums\.js|drum\.js|synth\.js|app\.js)\"/\1=\"\2?v=$STAMP\"/g" "$OUT/index.html"
echo "built $OUT ($(du -sk "$OUT" | cut -f1) KB)"
if [ "$1" = serve ]; then exec python3 -I tools/serve_web.py "$OUT"; fi
if [ "$1" = pages ]; then rm -rf docs; cp -R "$OUT" docs; touch docs/.nojekyll; echo "copied $OUT to docs/"; fi
