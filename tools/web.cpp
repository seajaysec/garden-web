// Garden in a browser: garden.cpp and articulate.cpp as they are, compiled to WebAssembly with the base's calls as
// stand-ins (as tools/host.cpp does on the desktop). web/app.js drives it: keys, knobs and the clock in; notes, the
// picture's parts and a summary of the state out. Built by web.sh.
#define GARDEN_HOST 1
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include <stdlib.h>
#include <emscripten/emscripten.h>
#include "garden.cpp"   // the pack's public garden.cpp (garden-op1f), found through -I; its host branch takes tools/host_world.h

HostWorld host;
extern "C" const Op1fCard op1f_card_garden = {};

// ---- notes out, as the base keeps them: one voice a pitch, an on of a sounding pitch and an off of a silent one refused
static unsigned char out_sounding[128];
enum { QMAX = 512 };
static int q_note[QMAX], q_vel[QMAX], q_on[QMAX], q_n;
static void queue(int note, int vel, int on) {
    if (q_n >= QMAX) return;
    q_note[q_n] = note; q_vel[q_n] = vel; q_on[q_n] = on; ++q_n;
}
extern "C" int op1f_note_on(const Op1fCard* card, unsigned note, unsigned velocity, unsigned flags) {
    if (card != &op1f_card_garden || note > 127 || velocity < 1 || velocity > 127 || flags || out_sounding[note]) return 0;
    out_sounding[note] = 1; queue((int)note, (int)velocity, 1); return 1;
}
extern "C" int op1f_note_off(const Op1fCard* card, unsigned note, unsigned flags) {
    if (card != &op1f_card_garden || note > 127 || flags || !out_sounding[note]) return 0;
    out_sounding[note] = 0; queue((int)note, 0, 0); return 1;
}
extern "C" unsigned op1f_mask() { return 0; }
extern "C" void op1f_unmask(unsigned) {}

// ---- the picture: each part shown or not and its matrix; each text and where it stands
enum { PART_WORDS = 7 };
static int parts[PART_COUNT][PART_WORDS];
struct Label { int m[9]; char text[32]; int align, made; };
static Label labels[TEXT_COUNT];
static int label_of(const char* part) { int t = part[0] == 't' ? atoi(part + 1) : -1; return t >= 0 && t < TEXT_COUNT ? t : -1; }
extern "C" int op1f_text_set(void*, const char* part, const char* text, int, unsigned align) {
    int t = label_of(part);
    if (t < 0 || align > 2) return 0;
    if (!labels[t].made) { labels[t].made = 1; labels[t].align = (int)align; labels[t].m[0] = labels[t].m[4] = labels[t].m[8] = 1024; }
    snprintf(labels[t].text, 32, "%s", text);
    return 1;
}
extern "C" void* op1f_text_node(void*, const char* part) { int t = label_of(part); return t >= 0 && labels[t].made ? &labels[t] : 0; }
static int is_label(void* p) { return (char*)p >= (char*)labels && (char*)p < (char*)(labels + TEXT_COUNT); }
extern "C" void op1f_log(int, const char*, int, const char*, ...) {}
static u32 ms_now;
extern "C" unsigned op1f_ms() { return ms_now; }
extern "C" void* op1f_node(void*, const char* name) {
    if (name[0] != 'n') return 0;
    int i = atoi(name + 1);
    if (i < 0 || i >= PART_COUNT) return 0;
    parts[i][0] = 1; parts[i][1] = parts[i][4] = 1024;
    return (void*)(intptr_t)(i + 1);
}
extern "C" void op1f_show(void* part, int on) { parts[(intptr_t)part - 1][0] = on ? 1 : 0; }
extern "C" void op1f_move(void* part, const int* m) {
    if (is_label(part)) { memcpy(((Label*)part)->m, m, 9 * sizeof(int)); return; }
    int* p = parts[(intptr_t)part - 1];
    p[1] = m[0]; p[2] = m[1]; p[3] = m[3]; p[4] = m[4]; p[5] = m[6]; p[6] = m[7];
}
static u32 doc[64];
extern "C" void* op1f_picture(const Op1fCard*, const char*) { return doc; }
extern "C" int op1f_page_stand_in(const Op1fCard* card, unsigned ask, void* document) { return card == &op1f_card_garden && ask == 0 && document == doc; }

// ---- the private folder: garden.bin, kept by the page in the browser's storage
static unsigned char file[512];
static int file_len = -1, file_writes;
extern "C" int op1f_read(const Op1fCard*, unsigned, const char*, void* out, unsigned bytes) {
    if (file_len < 0) return OP1F_NO_FILE;
    unsigned n = (unsigned)file_len < bytes ? (unsigned)file_len : bytes;
    memcpy(out, file, n);
    return (int)n;
}
extern "C" int op1f_write(const Op1fCard*, unsigned, const char*, const void* in, unsigned bytes) {
    if (bytes > sizeof file) return -1;
    memcpy(file, in, bytes); file_len = (int)bytes; ++file_writes;
    return (int)bytes;
}

// ---- calls in
// Two Gardens tick on one clock here: their steps fall on its grid, so their bars line up (garden.cpp's grid_align).
static struct GridOn { GridOn() { grid_align = 1; } } grid_on;
static int on, shown_page = 1;
static u32 instr;                                      // the instrument the page plays: 0 the synth, 1 the drum
static u32 frame_no, tick_count;
static const Op1fCard* page_card() { return shown_page ? &op1f_card_garden : 0; }

extern "C" {
EMSCRIPTEN_KEEPALIVE unsigned char* gw_file() { return file; }
EMSCRIPTEN_KEEPALIVE void gw_file_set(int len) { file_len = len; }
EMSCRIPTEN_KEEPALIVE int gw_file_len() { return file_len; }
EMSCRIPTEN_KEEPALIVE int gw_file_writes() { return file_writes; }
EMSCRIPTEN_KEEPALIVE int gw_settings_bytes() { return (int)sizeof(Settings); }
EMSCRIPTEN_KEEPALIVE unsigned char* gw_g() { return (unsigned char*)&g; }

EMSCRIPTEN_KEEPALIVE void gw_show(int yes) { shown_page = yes ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE void gw_mono(int mono) { host.slot = 0; host.envelopes[4] = mono ? (1u << 28) : 0u; }

EMSCRIPTEN_KEEPALIVE void gw_run(int yes) {
    if (yes == on) return;
    on = yes;
    if (yes) { tick_count = 0; garden_run(instr, OP1F_RUN_ON); garden_shown(instr, OP1F_SHOWN_UP); }
    else { garden_run(instr, OP1F_RUN_STOP); garden_shown(instr, OP1F_SHOWN_OFF); }
}

// The unit changing instrument, as the base does it: the sequencer of the one left is stopped, that of the one
// reached is on again (Garden is taken as chosen for both), and the screen is that instrument's.
EMSCRIPTEN_KEEPALIVE void gw_instrument(int drum) {
    u32 to = drum ? 1u : 0u;
    if (to == instr) return;
    if (on) garden_run(instr, OP1F_RUN_STOP);
    instr = to;
    if (on) { tick_count = 0; garden_run(instr, OP1F_RUN_ON); }
    garden_shown(instr, on ? (u32)OP1F_SHOWN_UP : (u32)OP1F_SHOWN_OFF);
}

EMSCRIPTEN_KEEPALIVE void gw_frame(unsigned ms, int shift) {
    ms_now = ms;
    Op1fFrame f = { 40, frame_no++, ms, 7, 77, (unsigned)shift, 0, page_card(), 0, 0 };
    garden_frame(&f);
}

EMSCRIPTEN_KEEPALIVE void gw_tick(unsigned tempo, unsigned us, int jumped) {
    if (!on) return;
    Op1fTick t = { 32, instr, tick_count % 48, tick_count, tempo, us, OP1F_CLOCK_OWN, (unsigned)jumped };
    ++tick_count;
    garden_tick(&t);
}

// A piano key or MIDI note: `key` 0 to 23 from the left (a MIDI note: note - 53). 1 when Garden took it.
EMSCRIPTEN_KEEPALIVE int gw_key(int down, int key, int note, int velocity, int shift, int midi) {
    if (!on) return 0;
    Op1fKey e = { 32, down ? (u32)OP1F_DOWN : (u32)OP1F_UP, instr, key, (unsigned)note, down ? (unsigned)velocity : 0u,
                  down ? (unsigned)shift : 0u, midi ? (u32)OP1F_FROM_MIDI : (u32)OP1F_FROM_KEYS };
    return garden_key(&e);
}

// A key or knob of the page, by the firmware's numbers: 0 help, 6 to 9 T1 to T4, the number keys, 54 to 57 the knob pushes.
EMSCRIPTEN_KEEPALIVE int gw_input(int what, int key, int turn, int shift) {
    unsigned record[4] = { (unsigned)key, 127, 0, 0 };
    Op1fInput e = { 40, (u32)what, (u32)key, turn, 7, 77, (unsigned)shift, page_card() ? 1u : 0u,
                    what == OP1F_DOWN || what == OP1F_DOWN_SHIFT ? record : 0, 0 };
    return garden_input(&e);
}

EMSCRIPTEN_KEEPALIVE int gw_notes() { return q_n; }
EMSCRIPTEN_KEEPALIVE int gw_note(int i) { return q_note[i] | q_vel[i] << 8 | q_on[i] << 16; }
EMSCRIPTEN_KEEPALIVE void gw_notes_clear() { q_n = 0; }

EMSCRIPTEN_KEEPALIVE int gw_part_count() { return PART_COUNT; }
EMSCRIPTEN_KEEPALIVE int* gw_parts() { return &parts[0][0]; }
EMSCRIPTEN_KEEPALIVE int gw_text_count() { return TEXT_COUNT; }
EMSCRIPTEN_KEEPALIVE const char* gw_text(int i) { return labels[i].text; }
EMSCRIPTEN_KEEPALIVE int gw_text_x(int i) { return labels[i].m[6] / 1024; }
EMSCRIPTEN_KEEPALIVE int gw_text_y(int i) { return labels[i].m[7] / 1024; }
EMSCRIPTEN_KEEPALIVE int gw_text_align(int i) { return labels[i].align; }
}

// ---- the state, as JSON, for the page's explanations and reports
static char js[8192];
static int jn;
static void put(const char* f, ...) {
    va_list a; va_start(a, f);
    int n = vsnprintf(js + jn, sizeof js - jn, f, a);
    va_end(a);
    if (n > 0) jn = jn + n < (int)sizeof js ? jn + n : (int)sizeof js - 1;
}
static void str(const char* k, const char* v) { put("\"%s\":\"%s\",", k, v ? v : ""); }
static void num(const char* k, int v) { put("\"%s\":%d,", k, v); }
static void bytes(const char* k, const unsigned char* b, int n) {
    put("\"%s\":[", k);
    for (int i = 0; i < n; ++i) put(i ? ",%d" : "%d", (int)b[i]);
    put("],");
}
static void close_obj() { if (js[jn - 1] == ',') --jn; put("}"); }

extern "C" EMSCRIPTEN_KEEPALIVE const char* gw_state(int shift) {
    jn = 0;
    put("{");
    num("on", on); num("drum", (int)instr); num("kit", drum_mode()); num("page", page); num("help", help_open); num("mono", st.mono);
    put("\"g\":{");
    num("cascade", g.cascade); num("boost", g.boost); num("style", g.style); num("rate", g.rate); num("order", g.order);
    num("phrase", g.phrase); num("vtype", g.vtype); num("pulse", g.pulse); num("loop", g.loop); num("hold", g.hold);
    num("lead", g.lead); num("length", g.length); num("swing", g.swing); num("human", g.human); num("quality", g.quality);
    num("fl", g.fl); num("pf", g.pf); num("pad_sel", g.pad_sel); num("square", g.square); num("walk_len", g.walk_len);
    num("walk_order", g.walk_order); num("root", g.root); num("extensions", g.extensions); num("echo", g.echo);
    num("ending", ending_of());
    bytes("kinds", &g.kinds[0][0], 8); bytes("extsets", &g.extsets[0][0], 8);
    bytes("seed_q", g.seed_q, 8); bytes("seed_ext", &g.seed_ext[0][0], 32); bytes("pad_root", g.pad_root, 8);
    bytes("pad_used", g.pad_used, 8);
    close_obj(); put(",");
    put("\"names\":{");
    str("style", style_name(g.style)); str("rate", RATE_NAME[g.rate < 12 ? g.rate : 0]);
    str("echo", ECHO_NAME[g.echo < ECHO_RATES ? g.echo : 0]); str("pulse", PULSE_NAME[g.pulse < PULSE_RATES ? g.pulse : 0]);
    str("boost", BOOST_NAME[clampi(g.boost + 2, 0, 4)]); str("order", art_order_names[g.order % ART_ORDERS]);
    str("voicing", art_voicing_names[g.vtype % ART_VOICINGS]); str("phrase", art_phrase_names[g.phrase % ART_PHRASES]);
    str("ending", ENDING_NAME[ending_of()]);
    str("cycle", CYCLE_NAME[cycle_of()]); str("downtime", DOWN_NAME[down_of()]);
    str("walk_len", WALK_LEN_NAME[g.walk_len % WALK_LENS]); str("walk_order", WALK_ORDER_NAME[g.walk_order % WALK_ORDERS]);
    put("\"kinds\":[");
    for (int i = 0; i < (int)ART_KINDS; ++i) put(i ? ",\"%s\"" : "\"%s\"", kind_name(i));
    put("],\"pollen\":[");
    for (int i = 0; i < (int)ART_POLLEN; ++i) put(i ? ",\"%s\"" : "\"%s\"", pollen_name(i));
    put("],\"keys\":[");
    for (int i = 0; i < (int)PADS; ++i) put(i ? ",\"%s\"" : "\"%s\"", PAD_NAME[i]);
    put("]},");
    put("\"view\":{");
    int n = view.n > ART_CHORD_MAX ? (int)ART_CHORD_MAX : (int)view.n;
    bytes("notes", (const unsigned char*)view.note, n);
    num("playing", view.playing); num("root", view.root); num("kind", view.kind); num("mask", view.mask);
    num("boosting", view.boosting); num("boost_note", view.boost_note); num("walking", view.walking);
    num("echoing", view.echoing); num("planter", view.planter); num("finishing", view.finishing);
    close_obj(); put(",");
    const char* turn[4];
    const char* push[4];
    help_words(page, shift, turn, push);
    put("\"turn\":[\"%s\",\"%s\",\"%s\",\"%s\"],", turn[0], turn[1], turn[2], turn[3]);
    put("\"push\":[\"%s\",\"%s\",\"%s\",\"%s\"]", push[0], push[1], push[2], push[3]);
    put("}");
    return js;
}
