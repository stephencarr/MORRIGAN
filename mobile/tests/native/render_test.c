/* SPDX-License-Identifier: GPL-3.0-only
 * Exercises the same libpd/core compiled into the Android shared library. */
#include "morrigan_engine.h"
#include <math.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

static FILE *recording;
static unsigned frames_written;
static float peak;
static unsigned checks;
static const unsigned rate = 48000;

static void require(int condition, const char *what) {
    checks++;
    if (!condition) { fprintf(stderr, "FAIL: %s (%s)\n", what, morrigan_error()); exit(1); }
}

static void little16(unsigned value) { fputc(value & 255, recording); fputc((value >> 8) & 255, recording); }
static void little32(unsigned value) { little16(value & 65535); little16(value >> 16); }

static void wav_header(unsigned frames) {
    rewind(recording);
    fwrite("RIFF", 1, 4, recording); little32(36 + frames * 4); fwrite("WAVEfmt ", 1, 8, recording);
    little32(16); little16(1); little16(2); little32(rate); little32(rate * 4); little16(4); little16(16);
    fwrite("data", 1, 4, recording); little32(frames * 4);
}

static double segment(const char *name, double seconds, double *crossings) {
    float block[128], prior = 0;
    double squares = 0;
    unsigned count = 0, rises = 0;
    unsigned ticks = (unsigned)(seconds * rate / 64);
    for (unsigned tick = 0; tick < ticks; tick++) {
        require(morrigan_process(block, 64) == 0, "render block");
        for (unsigned i = 0; i < 64; i++) {
            require(isfinite(block[i * 2]) && block[i * 2] == block[i * 2 + 1], "finite duplicated mono");
            for (unsigned channel = 0; channel < 2; channel++) {
                float v = block[i * 2 + channel];
                if (fabsf(v) > peak) peak = fabsf(v);
                int16_t pcm = (int16_t)lrintf(v * 32767);
                little16((uint16_t)pcm);
            }
            if (tick >= ticks / 2) {
                float v = block[i * 2];
                squares += v * v;
                if (prior <= 0 && v > 0) rises++;
                prior = v;
                count++;
            }
            frames_written++;
        }
    }
    double rms = sqrt(squares / count);
    if (crossings) *crossings = (double)rises * rate / count;
    printf("segment %s rms=%.9f crossings=%.3f\n", name, rms, (double)rises * rate / count);
    return rms;
}

static void *foreign_thread(void *unused) {
    (void)unused;
    float audio[128];
    return (void *)(intptr_t)(morrigan_process(audio, 64) != 0);
}

int main(int argc, char **argv) {
    if (argc != 3) { fprintf(stderr, "Usage: %s PATCH_DIRECTORY OUTPUT.wav\n", argv[0]); return 2; }
    float block[128];
    require(morrigan_process(block, 64) != 0, "uninitialized engine fails");
    require(morrigan_initialize(48000, argv[1]) == 0, "initialize original LIRA");
    require(morrigan_initialize(48000, argv[1]) != 0, "double initialization rejected");
    require(morrigan_parameter("sensor-1; pd quit", 1) != 0, "unknown selector rejected");
    require(morrigan_parameter("vol", NAN) != 0, "NaN rejected");
    require(morrigan_parameter("vol", INFINITY) != 0, "infinity rejected");
    require(morrigan_parameter("vol", 128) != 0, "range rejected");
    require(morrigan_parameter("sensor-1", 0.5f) != 0, "fractional gate rejected");
    require(morrigan_process(block, 63) != 0, "non-Pd block rejected");
    pthread_t other;
    void *thread_result = NULL;
    require(pthread_create(&other, NULL, foreign_thread, NULL) == 0, "foreign thread starts");
    pthread_join(other, &thread_result);
    require((intptr_t)thread_result == 1, "foreign-thread process rejected");
    recording = fopen(argv[2], "wb");
    require(recording != NULL, "recording opens");
    wav_header(0);
    require(segment("initial-silence", 0.4, NULL) < 0.0001, "startup is silent");
    for (int voice = 1; voice <= 8; voice++) {
        char name[24], phase[24];
        snprintf(name, sizeof(name), "sensor-%d", voice);
        require(morrigan_parameter(name, 1) == 0, "voice on accepted");
        snprintf(phase, sizeof(phase), "voice-%d", voice);
        require(segment(phase, 0.5, NULL) > 0.005, "individual voice audible");
        require(morrigan_parameter(name, 0) == 0, "voice off accepted");
        snprintf(phase, sizeof(phase), "release-%d", voice);
        require(segment(phase, 0.4, NULL) < 0.0001, "individual release silent");
    }
    double low, high;
    require(morrigan_parameter("tune-1", 24) == 0 && morrigan_parameter("sensor-1", 1) == 0, "low tuning accepted");
    segment("tune-low", 0.5, &low);
    require(morrigan_parameter("tune-1", 96) == 0, "high tuning accepted");
    segment("tune-high", 0.5, &high);
    require(high > 2 * low, "tuning changes observed waveform");
    for (int voice = 1; voice <= 8; voice++) {
        char name[24]; snprintf(name, sizeof(name), "sensor-%d", voice);
        require(morrigan_parameter(name, 1) == 0, "simultaneous on accepted");
    }
    require(segment("all-eight", 0.5, NULL) > 0.005, "simultaneous voices audible");
    for (int voice = 1; voice <= 8; voice++) {
        char name[24]; snprintf(name, sizeof(name), "sensor-%d", voice);
        require(morrigan_parameter(name, 0) == 0, "simultaneous off accepted");
    }
    require(segment("final-silence", 0.5, NULL) < 0.0001, "final release silent");
    require(morrigan_limited_samples() == 0, "safe preset never hits limiter");
    require(morrigan_invalid_samples() == 0, "no nonfinite engine output");
    require(peak < 0.95f, "whole recording unclipped");
    wav_header(frames_written);
    fclose(recording);
    require(morrigan_shutdown() == 0, "clean engine shutdown");
    require(morrigan_shutdown() == 0, "shutdown idempotent");
    require(morrigan_initialize(48000, argv[1]) == 0, "engine restart");
    require(morrigan_process(block, 64) == 0, "restarted engine renders");
    require(morrigan_shutdown() == 0, "restarted engine shuts down");
    printf("VERIFIED native-core checks=%u frames=%u rate=%u channels=2 peak=%.9f limiter=0 invalid=0\n", checks, frames_written, rate, peak);
    return 0;
}
