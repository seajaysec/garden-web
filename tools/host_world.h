// The unit's words garden.cpp reads, as plain variables of a desktop run (tools/host.cpp). Nothing here models the
// firmware: it lets the page, the engine and the picture logic run.
#include <stdint.h>

struct HostWorld {
    u32 slot;
    u32 envelopes[64];
};
extern HostWorld host;
#define SYNTH_SLOT host.slot
#define SYNTH_ENVELOPES ((uintptr_t)host.envelopes)

enum { TICKS_PER_BAR = 384 };
static inline u32 mask_off() { return 0; }
static inline void mask_on(u32) {}
