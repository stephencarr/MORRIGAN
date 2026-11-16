package org.morrigan.mobile.midi;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** Explicit mappings and note ownership; independent of Android for host tests. */
public final class LiraMidiMapper {
    public interface Sink {
        void onControl(String name, float value);
        void onPanic();
    }

    private static final int[] LCXL_NOTES = {41, 42, 43, 44, 57, 58, 59, 60};
    private final Sink sink;
    private final Map<String, Map<Integer, Integer>> held = new HashMap<>();
    private final int[] owners = new int[8];
    private String profile = "notes";

    public LiraMidiMapper(Sink sink) {
        if (sink == null) throw new IllegalArgumentException("Sink required");
        this.sink = sink;
    }

    public synchronized String profile() { return profile; }

    public synchronized void setProfile(String requested) {
        if (!"notes".equals(requested) && !"lcxl".equals(requested)) {
            throw new IllegalArgumentException("Profile must be notes or lcxl");
        }
        if (!profile.equals(requested)) {
            releaseAll();
            profile = requested;
        }
    }

    public synchronized void receive(String source, int status, int data1, int data2) {
        if (source == null || source.isEmpty() || status < 0x80 || status > 0xef
                || data1 < 0 || data1 > 127 || data2 < 0 || data2 > 127) return;
        int channel = status & 15;
        int kind = status & 0xf0;
        if (profile.equals("lcxl") && channel != 8) return; // MIDI channel 9.
        if (kind == 0x80 || kind == 0x90) {
            int key = channel * 128 + data1;
            if (kind == 0x80 || data2 == 0) release(source, key);
            else {
                int voice = voiceFor(data1);
                if (voice >= 0) {
                    Map<Integer, Integer> notes = held.computeIfAbsent(source, unused -> new HashMap<>());
                    if (!notes.containsKey(key)) {
                        notes.put(key, voice);
                        if (owners[voice]++ == 0) sink.onControl("sensor-" + (voice + 1), 1);
                    }
                }
            }
        } else if (kind == 0xb0) {
            if (data1 == 120 || data1 == 123) {
                releaseChannel(source, channel);
            } else if (profile.equals("notes")) {
                if (data1 >= 20 && data1 <= 27) sink.onControl("tune-" + (data1 - 19), data2);
                else if (data1 == 7) sink.onControl("vol", data2);
            } else if (data1 >= 13 && data1 <= 20) {
                sink.onControl("tune-" + (data1 - 12), data2);
            }
        }
    }

    public synchronized void disconnect(String source) {
        Map<Integer, Integer> notes = held.remove(source);
        if (notes != null) for (int voice : notes.values()) releaseVoice(voice);
    }

    /** Release this source/channel only; another controller can keep its note held. */
    private void releaseChannel(String source, int channel) {
        Map<Integer, Integer> notes = held.get(source);
        if (notes == null) return;
        Iterator<Map.Entry<Integer, Integer>> iterator = notes.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<Integer, Integer> entry = iterator.next();
            if (entry.getKey() / 128 == channel) {
                releaseVoice(entry.getValue());
                iterator.remove();
            }
        }
        if (notes.isEmpty()) held.remove(source);
    }

    private void release(String source, int key) {
        Map<Integer, Integer> notes = held.get(source);
        if (notes == null) return;
        Integer voice = notes.remove(key);
        if (voice != null) releaseVoice(voice);
        if (notes.isEmpty()) held.remove(source);
    }

    private void releaseVoice(int voice) {
        if (--owners[voice] == 0) sink.onControl("sensor-" + (voice + 1), 0);
    }

    public synchronized void releaseAll() {
        held.clear();
        for (int voice = 0; voice < owners.length; voice++) {
            if (owners[voice] > 0) sink.onControl("sensor-" + (voice + 1), 0);
            owners[voice] = 0;
        }
    }

    /** A global emergency stop, also used for MIDI System Reset. */
    public synchronized void panic() {
        releaseAll();
        sink.onPanic();
    }

    private int voiceFor(int note) {
        if (profile.equals("notes")) return note >= 36 && note <= 43 ? note - 36 : -1;
        for (int i = 0; i < LCXL_NOTES.length; i++) if (LCXL_NOTES[i] == note) return i;
        return -1;
    }
}
