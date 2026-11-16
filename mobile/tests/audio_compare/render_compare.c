/* SPDX-License-Identifier: GPL-3.0-only
 * Two independently controlled paths: production adapter, and direct libpd.
 * The reference uses no MORRIGAN default table or parameter implementation. */
#include "morrigan_engine.h"
#include "z_libpd.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void *reference_patch;
static int reference_id;
static int production;

static void require(int condition, const char *message) {
    if (!condition) { fprintf(stderr,"Comparison render failed: %s (%s)\n",message,morrigan_error()); exit(1); }
}

static void reference_parameter(const char *name, float value) {
    char receiver[100];
    snprintf(receiver,sizeof(receiver),"%d-r-%s",reference_id,name);
    require(!libpd_float(receiver,value),"reference receiver missing");
}

static void process(float *buffer) {
    require(!(production ? morrigan_process(buffer,64) : libpd_process_float(1,NULL,buffer)),"render block");
}

static void reference_initialize(const char *directory,const char *defaults) {
    float scratch[128];
    require(!libpd_init(),"reference libpd init");
    require(!libpd_init_audio(0,2,48000),"reference audio init");
    libpd_clear_search_path();
    libpd_add_to_search_path(directory);
    reference_patch=libpd_openfile("_LIRA-8.pd",directory);
    require(reference_patch!=NULL,"reference original patch opens");
    reference_id=libpd_getdollarzero(reference_patch);
    libpd_start_message(1); libpd_add_float(1); require(!libpd_finish_message("pd","dsp"),"reference DSP on");
    for(int tick=0;tick<187;tick++) require(!libpd_process_float(1,NULL,scratch),"reference warm-up");
    FILE *file=fopen(defaults,"r"); require(file!=NULL,"reference parameter data opens");
    char name[80]; float value;
    while(fscanf(file,"%79s %f",name,&value)==2) reference_parameter(name,value);
    require(feof(file),"reference parameter data parses");
    fclose(file);
    for(int tick=0;tick<187;tick++) require(!libpd_process_float(1,NULL,scratch),"reference settling");
}

int main(int argc,char **argv) {
    if(argc!=8) { fprintf(stderr,"usage: render_compare production|reference PATCH DEFAULTS EVENTS TICKS OUT.f32 META.txt\n"); return 2; }
    production=!strcmp(argv[1],"production");
    require(production || !strcmp(argv[1],"reference"),"known render path");
    if(production) require(!morrigan_initialize(48000,argv[2]),"production initializes");
    else reference_initialize(argv[2],argv[3]);
    FILE *events=fopen(argv[4],"r"),*output=fopen(argv[6],"wb");
    require(events && output,"render files open");
    int tick_count=atoi(argv[5]),event_tick=-1,consumed=0;
    char name[80]; float value,buffer[128];
    int have=fscanf(events,"%d %79s %f",&event_tick,name,&value)==3;
    for(int tick=0;tick<tick_count;tick++) {
        while(have && event_tick==tick) {
            if(production) require(!morrigan_parameter(name,value),"production event accepted");
            else reference_parameter(name,value);
            consumed++;
            have=fscanf(events,"%d %79s %f",&event_tick,name,&value)==3;
        }
        require(!have || event_tick>tick,"events sorted");
        process(buffer);
        require(fwrite(buffer,sizeof(float),128,output)==128,"audio file write");
    }
    require(!have && feof(events),"all events consumed");
    fclose(events); fclose(output);
    FILE *meta=fopen(argv[7],"w"); require(meta!=NULL,"metadata opens");
    fprintf(meta,"events=%d\nlimited=%lu\ninvalid=%lu\n",consumed,production?morrigan_limited_samples():0,production?morrigan_invalid_samples():0);
    fclose(meta);
    if(production) require(!morrigan_shutdown(),"production shutdown");
    else { libpd_start_message(1); libpd_add_float(0); libpd_finish_message("pd","dsp"); libpd_closefile(reference_patch); }
    return 0;
}
