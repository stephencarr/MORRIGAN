package org.morrigan.mobile.midi;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Executable host tests; no Android runtime or mocking of the MIDI decoder. */
public final class MidiTests {
    private static int passed;

    private static final class Capture implements LiraMidiMapper.Sink {
        final List<String> events = new ArrayList<>();
        int panics;
        @Override public void onControl(String name, float value) { events.add(name + "=" + value); }
        @Override public void onPanic() { panics++; }
    }

    private static final class Messages implements MidiStreamParser.Listener {
        final List<String> messages = new ArrayList<>();
        int resets;
        @Override public void onMessage(int status, int a, int b) { messages.add(status + ":" + a + ":" + b); }
        @Override public void onSystemReset() { resets++; }
    }

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int i = 0; i < values.length; i++) result[i] = (byte) values[i];
        return result;
    }

    private static void feed(MidiStreamParser parser, int... values) {
        byte[] data = bytes(values);
        parser.accept(data, 0, data.length);
    }

    private static void equal(Object actual, Object expected) {
        if (!actual.equals(expected)) throw new AssertionError("Expected " + expected + ", got " + actual);
    }

    private static void events(Capture capture, String... values) {
        equal(capture.events, Arrays.asList(values));
    }

    private static void bad(Runnable runnable) {
        try { runnable.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected rejected input");
    }

    private static void test(String name, Runnable run) {
        run.run();
        passed++;
        System.out.println("PASS " + name);
    }

    public static void main(String[] args) {
        test("fragmentation and interleaved realtime preserve running status", () -> {
            Messages m = new Messages();
            MidiStreamParser p = new MidiStreamParser(m);
            feed(p, 0x90, 36);
            feed(p, 0xf8, 100, 37);
            feed(p, 0xfa, 0xfb, 0xfc, 0xfe, 110, 36, 0);
            equal(m.messages, Arrays.asList("144:36:100", "144:37:110", "144:36:0"));
        });
        test("program change and pressure consume one data byte", () -> {
            Messages m = new Messages();
            MidiStreamParser p = new MidiStreamParser(m);
            feed(p, 0xc1, 10, 11, 0xd2, 55, 56, 0x92, 38, 127);
            equal(m.messages, Arrays.asList("193:10:0", "193:11:0", "210:55:0", "210:56:0", "146:38:127"));
        });
        test("system common cancels running status", () -> {
            Messages m = new Messages();
            MidiStreamParser p = new MidiStreamParser(m);
            feed(p, 0x90, 36, 1, 0xf2, 1, 0xf8, 2, 37, 100, 0xf1, 1, 0xf3, 4, 0xf6, 0x80, 36, 0);
            equal(m.messages, Arrays.asList("144:36:1", "128:36:0"));
        });
        test("bounded SysEx ignores payload and resynchronizes", () -> {
            Messages m = new Messages();
            MidiStreamParser p = new MidiStreamParser(m);
            feed(p, 0xf0, 0x7d, 36, 127, 0xf8);
            byte[] large = new byte[65536];
            Arrays.fill(large, (byte) 127);
            p.accept(large, 0, large.length);
            feed(p, 0xf7, 36, 127, 0x90, 36, 1, 0xf0, 1, 2, 0x80, 36, 0);
            equal(m.messages, Arrays.asList("144:36:1", "128:36:0"));
        });
        test("reset discards partial messages and emits one panic", () -> {
            Messages m = new Messages();
            MidiStreamParser p = new MidiStreamParser(m);
            feed(p, 0x90, 36, 0xff, 100, 37, 100, 0x90, 38, 100);
            equal(m.resets, 1);
            equal(m.messages, Arrays.asList("144:38:100"));
        });
        test("byte slices and invalid bounds", () -> {
            Messages m = new Messages();
            MidiStreamParser p = new MidiStreamParser(m);
            byte[] data = bytes(0, 0x90, 36, 127, 0);
            p.accept(data, 1, 3);
            p.accept(data, 5, 0);
            equal(m.messages, Arrays.asList("144:36:127"));
            bad(() -> p.accept(data, -1, 1));
            bad(() -> p.accept(data, 0, Integer.MAX_VALUE));
            bad(() -> p.accept(data, 6, 0));
            bad(() -> p.accept(null, 0, 0));
        });
        test("standard eight voices and velocity-zero release", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            for (int i = 0; i < 8; i++) m.receive("a", 0x90, 36 + i, 127);
            for (int i = 0; i < 8; i++) m.receive("a", 0x90, 36 + i, 0);
            equal(c.events.size(), 16);
            for (int i = 0; i < 8; i++) {
                equal(c.events.get(i), "sensor-" + (i + 1) + "=1.0");
                equal(c.events.get(i + 8), "sensor-" + (i + 1) + "=0.0");
            }
        });
        test("repeated note-on and unmatched off cannot stick or underflow", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive("a", 0x90, 36, 1);
            m.receive("a", 0x90, 36, 100);
            m.receive("a", 0x80, 36, 64);
            m.receive("a", 0x80, 36, 0);
            m.receive("a", 0x90, 36, 1);
            m.disconnect("a");
            events(c, "sensor-1=1.0", "sensor-1=0.0", "sensor-1=1.0", "sensor-1=0.0");
        });
        test("device and channel ownership survive another owner releasing", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive("a", 0x90, 36, 1);
            m.receive("a", 0x91, 36, 1);
            m.receive("b", 0x90, 36, 1);
            m.receive("a", 0x80, 36, 0);
            m.disconnect("b");
            events(c, "sensor-1=1.0");
            m.receive("a", 0x81, 36, 0);
            events(c, "sensor-1=1.0", "sensor-1=0.0");
        });
        test("all-notes-off releases only originating source/channel", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive("a", 0x90, 36, 1);
            m.receive("b", 0x90, 36, 1);
            m.receive("a", 0x91, 37, 1);
            m.receive("a", 0xb0, 123, 0);
            events(c, "sensor-1=1.0", "sensor-2=1.0");
            m.receive("b", 0xb0, 120, 0);
            m.receive("a", 0xb1, 123, 0);
            events(c, "sensor-1=1.0", "sensor-2=1.0", "sensor-1=0.0", "sensor-2=0.0");
            equal(c.panics, 0);
        });
        test("standard CC tunes and master; other messages remain inert", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive("a", 0xb0, 20, 0);
            m.receive("a", 0xbf, 27, 127);
            m.receive("a", 0xb4, 7, 90);
            m.receive("a", 0xb0, 19, 100);
            m.receive("a", 0xe0, 0, 100);
            m.receive("a", 0x90, 44, 100);
            m.receive("a", 0x90, 35, 100);
            events(c, "tune-1=0.0", "tune-8=127.0", "vol=90.0");
        });
        test("LCXL factory template channel and exact first button row", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.setProfile("lcxl");
            int[] notes = {41, 42, 43, 44, 57, 58, 59, 60};
            for (int note : notes) m.receive("lc", 0x90, note, 127); // wrong channel
            equal(c.events.size(), 0);
            for (int i = 0; i < notes.length; i++) m.receive("lc", 0x98, notes[i], 127);
            for (int i = 0; i < notes.length; i++) m.receive("lc", 0x88, notes[i], 0);
            equal(c.events.size(), 16);
            for (int i = 0; i < 8; i++) equal(c.events.get(i), "sensor-" + (i + 1) + "=1.0");
            m.receive("lc", 0x98, 73, 127); // second row is not mapped
            equal(c.events.size(), 16);
        });
        test("LCXL top knobs only, no invented fader/voice-volume control", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.setProfile("lcxl");
            for (int i = 0; i < 8; i++) m.receive("lc", 0xb8, 13 + i, i * 16);
            m.receive("lc", 0xb8, 77, 127);
            m.receive("lc", 0xb8, 7, 127);
            m.receive("lc", 0xb0, 13, 127);
            equal(c.events.size(), 8);
            for (int i = 0; i < 8; i++) equal(c.events.get(i), "tune-" + (i + 1) + "=" + (float)(i * 16));
        });
        test("profile switch releases notes and invalid profiles preserve state", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive("a", 0x90, 36, 1);
            bad(() -> m.setProfile("anything"));
            events(c, "sensor-1=1.0");
            equal(m.profile(), "notes");
            m.setProfile("lcxl");
            events(c, "sensor-1=1.0", "sensor-1=0.0");
            equal(m.profile(), "lcxl");
        });
        test("global panic clears all owners, then new notes work", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive("a", 0x90, 36, 1);
            m.receive("b", 0x90, 36, 1);
            m.panic();
            equal(c.panics, 1);
            m.receive("a", 0x80, 36, 0);
            m.receive("a", 0x90, 36, 1);
            events(c, "sensor-1=1.0", "sensor-1=0.0", "sensor-1=1.0");
        });
        test("decoder to mapper integration: packet splits, CC and reset", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            MidiStreamParser p = new MidiStreamParser(new MidiStreamParser.Listener() {
                @Override public void onMessage(int s, int a, int b) { m.receive("usb:0", s, a, b); }
                @Override public void onSystemReset() { m.panic(); }
            });
            feed(p, 0x90, 36);
            feed(p, 0xf8, 100, 0xb0, 20);
            feed(p, 50, 0xff, 36, 127);
            events(c, "sensor-1=1.0", "tune-1=50.0", "sensor-1=0.0");
            equal(c.panics, 1);
        });
        test("out-of-domain mapper input is ignored", () -> {
            Capture c = new Capture();
            LiraMidiMapper m = new LiraMidiMapper(c);
            m.receive(null, 0x90, 36, 127);
            m.receive("a", 0x90, 36, 128);
            m.receive("a", 0x90, -1, 127);
            m.receive("a", 0xf0, 36, 127);
            equal(c.events.size(), 0);
        });
        System.out.println("MIDI TESTS: " + passed + " passed");
    }
}
