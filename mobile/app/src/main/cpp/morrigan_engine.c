/* SPDX-License-Identifier: GPL-3.0-only */
#include "morrigan_engine.h"
#include "lira_factory.h"
#include "z_libpd.h"
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>

static int initialized;
static void *patch;
static int instance_id;
static pthread_t owner;
static char error_text[256];
static int loading_errors;
static unsigned long limited_samples;
static unsigned long invalid_samples;

const char *morrigan_error(void) { return error_text; }
unsigned long morrigan_limited_samples(void) { return limited_samples; }
unsigned long morrigan_invalid_samples(void) { return invalid_samples; }

static int fail(const char *message) {
    snprintf(error_text, sizeof(error_text), "%s", message);
    return -1;
}

static void pd_print(const char *text) {
    if (strstr(text, "error:") || strstr(text, "couldn't create") || strstr(text, "connection failed"))
        loading_errors++;
    fputs(text, stderr);
}

static int owned(void) {
    if (!patch) return fail("LIRA is not initialized");
    if (!pthread_equal(owner, pthread_self())) return fail("LIRA must be used on its owning audio thread");
    return 0;
}

static int parameter_max(const char *name) {
    size_t n;
    if (!name) return -1;
    if (strlen(name) == 8 && strncmp(name, "sensor-", 7) == 0 && name[7] >= '1' && name[7] <= '8') return 1;
    for (n = 0; n < sizeof(lira_parameters)/sizeof(*lira_parameters); n++)
        if (!strcmp(name, lira_parameters[n].name)) return lira_parameters[n].maximum;
    return -1;
}

int morrigan_parameter(const char *name, float value) {
    char receiver[80];
    int maximum;
    if (owned()) return -1;
    maximum = parameter_max(name);
    if (maximum < 0 || !isfinite(value) || value < 0 || value > maximum ||
        (maximum <= 2 && floorf(value) != value)) return fail("Unknown control or out-of-range/nonfinite value");
    snprintf(receiver, sizeof(receiver), "%d-r-%s", instance_id, name);
    if (libpd_float(receiver, value)) return fail("LIRA receiver is missing");
    return 0;
}

static int defaults(void) {
    size_t i;
    char name[16];
    /* Keep the original musical preset. Only master volume is lowered; the
       caller may restore its persisted master value before audible output. */
    for (i = 0; i < sizeof(lira_parameters)/sizeof(*lira_parameters); i++) {
        const LiraParameter *p = &lira_parameters[i];
        if (morrigan_parameter(p->name, !strcmp(p->name, "vol") ? 64 : p->factory)) return -1;
    }
    for (i = 1; i <= 8; i++) {
        snprintf(name, sizeof(name), "sensor-%zu", i);
        if (morrigan_parameter(name, 0)) return -1;
    }
    return 0;
}

int morrigan_initialize(int sample_rate, const char *patch_directory) {
    float settling[128];
    if (patch) return fail("LIRA already initialized");
    if (!patch_directory || sample_rate < 8000 || sample_rate > 192000) return fail("Invalid sample rate or patch directory");
    owner = pthread_self();
    error_text[0] = '\0';
    loading_errors = 0;
    limited_samples = invalid_samples = 0;
    if (!initialized) {
        libpd_set_printhook(pd_print);
        if (libpd_init()) return fail("libpd initialization failed");
        initialized = 1;
    }
    if (libpd_init_audio(0, 2, sample_rate)) return fail("libpd audio setup failed");
    libpd_clear_search_path();
    libpd_add_to_search_path(patch_directory);
    patch = libpd_openfile("_LIRA-8.pd", patch_directory);
    if (!patch) return fail("Could not open original LIRA patch");
    instance_id = libpd_getdollarzero(patch);
    if (instance_id <= 0 || loading_errors) {
        morrigan_shutdown();
        return fail("LIRA patch reported missing objects or invalid connections");
    }
    libpd_start_message(1);
    libpd_add_float(1);
    if (libpd_finish_message("pd", "dsp")) {
        morrigan_shutdown();
        return fail("Could not enable Pd DSP");
    }
    /* Allow loadbang/preset timers to settle without sending startup audio out. */
    for (int i = 0; i < (sample_rate / 64 / 4); i++) libpd_process_float(1, NULL, settling);
    if (defaults()) {
        morrigan_shutdown();
        return fail("LIRA default preset could not be initialized");
    }
    for (int i = 0; i < (sample_rate / 64 / 4); i++) libpd_process_float(1, NULL, settling);
    return 0;
}

int morrigan_process(float *output, int frames) {
    if (owned()) return -1;
    if (!output || frames <= 0 || frames > 4096 || frames % 64) return fail("Frames must be a positive multiple of 64, at most 4096");
    if (libpd_process_float(frames / 64, NULL, output)) return fail("libpd audio processing failed");
    for (int i = 0; i < frames * 2; i++) {
        if (!isfinite(output[i])) { output[i] = 0; invalid_samples++; }
        else if (output[i] > 0.95f) { output[i] = 0.95f; limited_samples++; }
        else if (output[i] < -0.95f) { output[i] = -0.95f; limited_samples++; }
    }
    return 0;
}

int morrigan_shutdown(void) {
    if (!patch) return 0;
    if (owned()) return -1;
    libpd_start_message(1);
    libpd_add_float(0);
    libpd_finish_message("pd", "dsp");
    libpd_closefile(patch);
    patch = NULL;
    return 0;
}
