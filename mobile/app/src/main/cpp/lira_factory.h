/* SPDX-License-Identifier: GPL-3.0-only
 * Parameter data transcribed from Miguel Moreno's BSD-licensed standalone
 * LIRA-8 parameters.txt at 6a6b6cbc3359a20d7741c9270c7690ab6b21c92a.
 * Order matches the original gui.link indices, 1..47. */
#ifndef MORRIGAN_LIRA_FACTORY_H
#define MORRIGAN_LIRA_FACTORY_H
typedef struct { const char *name; int maximum; float factory; } LiraParameter;
static const LiraParameter lira_parameters[] = {
    {"tune-1",127,0}, {"tune-2",127,78}, {"tune-3",127,74}, {"tune-4",127,36},
    {"tune-5",127,27}, {"tune-6",127,57}, {"tune-7",127,60}, {"tune-8",127,51},
    {"fast-12",1,1}, {"fast-34",1,1}, {"fast-56",1,1}, {"fast-78",1,1},
    {"sharp-12",127,14.3774f}, {"sharp-34",127,43.1321f}, {"sharp-56",127,103.038f}, {"sharp-78",127,71.8868f},
    {"mod-12",127,0}, {"mod-34",127,0}, {"mod-56",127,0}, {"mod-78",127,0},
    {"source-12",2,0}, {"source-34",2,0}, {"source-56",2,0}, {"source-78",2,0},
    {"pitch-1234",127,66}, {"pitch-5678",127,65}, {"hold-1234",127,0}, {"hold-5678",127,0},
    {"switch",1,0}, {"total-fb",1,0}, {"vibrato",1,1},
    {"drv",127,86}, {"dst-mix",127,69}, {"vol",127,127},
    {"f-a",127,42}, {"f-b",127,64}, {"andor",1,1}, {"link",1,1},
    {"time-1",127,94.5745f}, {"time-2",127,56.7447f}, {"feedback",127,54.0426f}, {"del-mix",127,67.5532f},
    {"mod-1",127,40.7358f}, {"mod-2",127,47.9245f}, {"del-mod",2,2}, {"lfo-wav",1,0}, {"quantize",1,0}
};
#endif
