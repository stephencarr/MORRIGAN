package org.morrigan.mobile;

/** Real libpd/LIRA engine. Invoke every method from the single owning audio thread. */
public final class NativeLira {
    static { System.loadLibrary("morrigan_lira"); }
    private NativeLira() {}
    public static native void initialize(int sampleRate, String patchDirectory);
    public static native void setParameter(String name, float value);
    /** Interleaved L/R; frames must be a multiple of 64 and at most 4096. */
    public static native void process(float[] interleavedStereo, int frames);
    public static native long limitedSamples();
    public static native long invalidSamples();
    public static native void shutdown();
}
