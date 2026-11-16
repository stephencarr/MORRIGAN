/* SPDX-License-Identifier: GPL-3.0-only */
#include <jni.h>
#include "morrigan_engine.h"

static float audio_buffer[8192];

static void throw_error(JNIEnv *env, const char *kind) {
    jclass type = (*env)->FindClass(env, kind);
    if (type) (*env)->ThrowNew(env, type, morrigan_error());
}

JNIEXPORT void JNICALL Java_org_morrigan_mobile_NativeLira_initialize(JNIEnv *env, jclass type, jint rate, jstring directory) {
    (void)type;
    if (!directory) {
        jclass error = (*env)->FindClass(env, "java/lang/IllegalArgumentException");
        if (error) (*env)->ThrowNew(env, error, "Patch directory is required");
        return;
    }
    const char *path = (*env)->GetStringUTFChars(env, directory, NULL);
    if (!path) return;
    int result = morrigan_initialize(rate, path);
    (*env)->ReleaseStringUTFChars(env, directory, path);
    if (result) throw_error(env, "java/lang/IllegalStateException");
}

JNIEXPORT void JNICALL Java_org_morrigan_mobile_NativeLira_setParameter(JNIEnv *env, jclass type, jstring name, jfloat value) {
    (void)type;
    if (!name) {
        jclass error = (*env)->FindClass(env, "java/lang/IllegalArgumentException");
        if (error) (*env)->ThrowNew(env, error, "Parameter name is required");
        return;
    }
    const char *control = (*env)->GetStringUTFChars(env, name, NULL);
    if (!control) return;
    int result = morrigan_parameter(control, value);
    (*env)->ReleaseStringUTFChars(env, name, control);
    if (result) throw_error(env, "java/lang/IllegalArgumentException");
}

JNIEXPORT void JNICALL Java_org_morrigan_mobile_NativeLira_process(JNIEnv *env, jclass type, jfloatArray buffer, jint frames) {
    (void)type;
    if (!buffer || frames <= 0 || frames > 4096 || frames % 64 || (*env)->GetArrayLength(env, buffer) < frames * 2) {
        jclass error = (*env)->FindClass(env, "java/lang/IllegalArgumentException");
        if (error) (*env)->ThrowNew(env, error, "Output needs 2 floats/frame, 1..4096 frames in blocks of 64");
        return;
    }
    if (morrigan_process(audio_buffer, frames)) {
        throw_error(env, "java/lang/IllegalStateException");
        return;
    }
    (*env)->SetFloatArrayRegion(env, buffer, 0, frames * 2, audio_buffer);
}

JNIEXPORT void JNICALL Java_org_morrigan_mobile_NativeLira_shutdown(JNIEnv *env, jclass type) {
    (void)type;
    if (morrigan_shutdown()) throw_error(env, "java/lang/IllegalStateException");
}

JNIEXPORT jlong JNICALL Java_org_morrigan_mobile_NativeLira_limitedSamples(JNIEnv *env, jclass type) {
    (void)env; (void)type;
    return (jlong)morrigan_limited_samples();
}

JNIEXPORT jlong JNICALL Java_org_morrigan_mobile_NativeLira_invalidSamples(JNIEnv *env, jclass type) {
    (void)env; (void)type;
    return (jlong)morrigan_invalid_samples();
}
