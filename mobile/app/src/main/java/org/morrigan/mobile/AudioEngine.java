package org.morrigan.mobile;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Process;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** One owner thread for libpd and AudioTrack. UI and MIDI never enter Pd directly. */
final class AudioEngine {
    // libpd is process-global. A service recreated during shutdown must wait for
    // the previous worker to finish, even if its bounded onDestroy join expires.
    private static final Object NATIVE_OWNER = new Object();
    interface Listener { void onEnded(String reason); }
    static final AudioAttributes ATTRIBUTES = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
    private final Context context;
    private final Listener listener;
    // Bounded by the small known set of application parameters; newest knob value wins.
    private final ConcurrentHashMap<String, Float> pending = new ConcurrentHashMap<>();
    private volatile boolean requested;
    private volatile boolean running;
    private volatile Thread thread;
    private volatile AudioTrack track;
    private volatile String status = "STOPPED";
    private volatile float[] scope = new float[512];
    private volatile int underruns;
    private volatile long limitedSamples, invalidSamples;

    AudioEngine(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    synchronized boolean start(Map<String, Float> parameters) {
        if (thread != null) return false;
        pending.clear();
        pending.putAll(parameters);
        requested = true;
        status = "STARTING LIRA";
        thread = new Thread(this::run, "morrigan-audio");
        thread.start();
        return true;
    }

    void control(String parameter, float value) {
        if (requested && Float.isFinite(value)) pending.put(parameter, value);
    }

    void stop() {
        requested = false;
        AudioTrack active = track;
        if (active != null) {
            try { active.pause(); active.flush(); } catch (IllegalStateException ignored) { }
        }
    }

    boolean running() { return running; }
    boolean active() { return thread != null; }
    String status() { return status; }
    float[] snapshot() { return scope; }
    int underruns() { return underruns; }
    long limitedSamples() { return limitedSamples; }
    long invalidSamples() { return invalidSamples; }

    void awaitStopped() {
        Thread worker = thread;
        if (worker != null && worker != Thread.currentThread()) {
            try { worker.join(1500); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }
    }

    private void drainControls() {
        for (Map.Entry<String, Float> command : pending.entrySet()) {
            if (pending.remove(command.getKey(), command.getValue()))
                NativeLira.setParameter(command.getKey(), command.getValue());
        }
    }

    private void copyAssets(String name, File destination) throws IOException {
        String[] children = context.getAssets().list(name);
        if (children != null && children.length > 0) {
            if (!destination.isDirectory() && !destination.mkdirs()) throw new IOException("Cannot create patch directory");
            for (String child : children) copyAssets(name + "/" + child, new File(destination, child));
        } else {
            try (InputStream input = context.getAssets().open(name);
                 FileOutputStream output = new FileOutputStream(destination)) {
                byte[] bytes = new byte[8192];
                for (int count; (count = input.read(bytes)) != -1;) output.write(bytes, 0, count);
            }
        }
    }

    private void run() {
        synchronized (NATIVE_OWNER) { runOwned(); }
    }

    private void runOwned() {
        AudioTrack audio = null;
        boolean initialized = false;
        String ended = "STOPPED";
        try {
            if (!requested) return;
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
            File patch = new File(context.getFilesDir(), "lira");
            copyAssets("lira", patch);
            AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            String property = manager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE);
            int sampleRate = 48000;
            try { if (property != null) sampleRate = Integer.parseInt(property); } catch (NumberFormatException ignored) { }
            if (sampleRate < 32000 || sampleRate > 192000) sampleRate = 48000;
            int frames = 256;
            int minimum = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT);
            if (minimum <= 0) throw new IOException("Audio output unavailable");
            audio = new AudioTrack.Builder().setAudioAttributes(ATTRIBUTES)
                    .setAudioFormat(new AudioFormat.Builder().setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build())
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
                    .setBufferSizeInBytes(Math.max(minimum, frames * 2 * 4 * 2)).build();
            if (audio.getState() != AudioTrack.STATE_INITIALIZED) throw new IOException("AudioTrack did not initialize");
            NativeLira.initialize(sampleRate, patch.getAbsolutePath());
            initialized = true;
            track = audio;
            if (!requested) return;
            // Apply the displayed preset before any block can reach the output.
            drainControls();
            audio.play();
            running = true;
            underruns = 0;
            limitedSamples = invalidSamples = 0;
            status = "LIRA · " + sampleRate + " HZ · " + audio.getBufferSizeInFrames() + " FR";
            float[] block = new float[frames * 2];
            float[] ring = new float[1024];
            int write = 0;
            int blocks = 0;
            while (requested) {
                drainControls();
                NativeLira.process(block, frames);
                int position = 0;
                while (position < block.length && requested) {
                    int written = audio.write(block, position, block.length - position, AudioTrack.WRITE_BLOCKING);
                    if (written <= 0) throw new IOException("Audio output stopped (" + written + ")");
                    position += written;
                }
                for (int i = 0; i < frames; i++) {
                    ring[write] = (block[i * 2] + block[i * 2 + 1]) * 0.5f;
                    write = (write + 1) % ring.length;
                }
                if (++blocks % 4 == 0) {
                    float[] display = new float[512];
                    for (int i = 0; i < display.length; i++) display[i] = ring[(write + i * 2) % ring.length];
                    scope = display;
                    underruns = audio.getUnderrunCount();
                    limitedSamples = NativeLira.limitedSamples();
                    invalidSamples = NativeLira.invalidSamples();
                }
            }
        } catch (Exception | LinkageError error) {
            ended = requested ? "AUDIO ERROR: " + error.getMessage() : "STOPPED";
            android.util.Log.e("MorriganAudio", ended, error);
        } finally {
            requested = false;
            running = false;
            track = null;
            if (audio != null) {
                try { audio.pause(); audio.flush(); } catch (IllegalStateException ignored) { }
                audio.release();
            }
            if (initialized) {
                try { NativeLira.shutdown(); } catch (Exception | LinkageError error) { android.util.Log.e("MorriganAudio", "Shutdown failed", error); }
            }
            pending.clear();
            scope = new float[512];
            status = ended;
            synchronized (this) { thread = null; }
            listener.onEnded(ended);
        }
    }
}
