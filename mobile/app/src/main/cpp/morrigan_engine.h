#ifndef MORRIGAN_ENGINE_H
#define MORRIGAN_ENGINE_H

/* SPDX-License-Identifier: GPL-3.0-only
 * One engine, owned by one audio thread. No network, GUI or hardware access. */
int morrigan_initialize(int sample_rate, const char *patch_directory);
int morrigan_parameter(const char *name, float value);
int morrigan_process(float *interleaved_stereo, int frames);
int morrigan_shutdown(void);
const char *morrigan_error(void);
unsigned long morrigan_limited_samples(void);
unsigned long morrigan_invalid_samples(void);

#endif
