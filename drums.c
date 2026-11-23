/* SPDX-License-Identifier: GPL-3.0-only */
/* Garden's web drum: X0X's 909 and 808 engines (x0x/, unchanged from X0X 6515e77) compiled to WebAssembly, one hit
 * rendered at a time. web/drum.js asks for each key's sound once, at load, and plays the buffers back.
 *
 *   dr_begin(engine)              a fresh kit: 0 the 909, 1 the 808, every pot at its default
 *   dr_set(name, value)           the voice's pot of that name (as the engine names it), for the next hit
 *   dr_render(voice, vel, max)    the hit, mono and dry (the sends are left out), into dr_out(); answers its length:
 *                                 to where the voice falls silent, or `max` samples
 *
 * 44.1 kHz, as the engines run. No allocation: the kits and the buffer are static. */
#include <stdint.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "x0x/drum909.h"
#include "x0x/drum808.h"

enum { BLOCK = 256, MAX_OUT = 44100 * 6 };
static drum909_t k909;
static drum808_t k808;
static int engine;
static float out[MAX_OUT];
static float dry[BLOCK], rev[BLOCK], dly[BLOCK];

static int same(const char *a, const char *b) {
    while (*a && *b) {
        char x = *a >= 'A' && *a <= 'Z' ? *a + 32 : *a, y = *b >= 'A' && *b <= 'Z' ? *b + 32 : *b;
        if (x != y) return 0;
        ++a; ++b;
    }
    return *a == *b;
}

EMSCRIPTEN_KEEPALIVE float *dr_out(void) { return out; }
EMSCRIPTEN_KEEPALIVE int dr_voices(int e) { return e ? D8_NUM : DR_NUM; }

EMSCRIPTEN_KEEPALIVE void dr_begin(int e) {
    engine = e ? 1 : 0;
    if (engine) drum808_init(&k808); else drum909_init(&k909);
}

/* the pot of that name on voice v; -1 when it has none */
EMSCRIPTEN_KEEPALIVE int dr_set(int v, const char *name, int value) {
    int n = engine ? drum808_nparams(v) : drum909_nparams(v);
    for (int i = 0; i < n; ++i) {
        const x0x_param_t *p = engine ? drum808_param(v, i) : drum909_param(v, i);
        if (!p || !same(p->name, name)) continue;
        if (value < 0) value = 0;
        if (value > p->max) value = p->max;
        if (engine) drum808_set(&k808, v, i, value); else drum909_set(&k909, v, i, value);
        return i;
    }
    return -1;
}

EMSCRIPTEN_KEEPALIVE int dr_render(int v, float vel, int max) {
    if (max > MAX_OUT) max = MAX_OUT;
    if (engine) { drum808_pan_settle(&k808); drum808_trigger(&k808, v, vel); }
    else { drum909_pan_settle(&k909); drum909_trigger(&k909, v, vel); }
    int at = 0;
    while (at < max) {
        int n = max - at < BLOCK ? max - at : BLOCK;
        memset(dry, 0, sizeof dry); memset(rev, 0, sizeof rev); memset(dly, 0, sizeof dly);
        if (engine) drum808_render(&k808, dry, rev, dly, n); else drum909_render(&k909, dry, rev, dly, n);
        memcpy(out + at, dry, (size_t)n * sizeof(float));
        at += n;
        if (!(engine ? drum808_active(&k808) : drum909_active(&k909))) break;
    }
    return at;
}
