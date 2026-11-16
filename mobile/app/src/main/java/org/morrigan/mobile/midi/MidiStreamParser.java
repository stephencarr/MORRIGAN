package org.morrigan.mobile.midi;

/** Bounded MIDI 1 byte-stream decoder. One instance belongs to one device port. */
public final class MidiStreamParser {
    public interface Listener {
        void onMessage(int status, int data1, int data2);
        default void onSystemReset() { }
    }

    private final Listener listener;
    private int runningStatus;
    private int first;
    private int received;
    private int systemRemaining;
    private boolean sysex;

    public MidiStreamParser(Listener listener) {
        if (listener == null) throw new IllegalArgumentException("Listener required");
        this.listener = listener;
    }

    public synchronized void reset() {
        runningStatus = 0;
        received = 0;
        systemRemaining = 0;
        sysex = false;
    }

    public synchronized void accept(byte[] bytes, int offset, int count) {
        if (bytes == null || offset < 0 || count < 0 || offset > bytes.length
                || count > bytes.length - offset) {
            throw new IllegalArgumentException("Invalid MIDI byte range");
        }
        for (int i = offset; i < offset + count; i++) acceptByte(bytes[i] & 0xff);
    }

    private void acceptByte(int value) {
        // Realtime may occur between any two bytes, even inside SysEx.
        if (value >= 0xf8) {
            if (value == 0xff) {
                reset();
                listener.onSystemReset();
            }
            return;
        }
        if (value >= 0x80) {
            received = 0;
            systemRemaining = 0;
            sysex = value == 0xf0;
            if (value < 0xf0) {
                runningStatus = value;
            } else {
                runningStatus = 0;
                if (value == 0xf1 || value == 0xf3) systemRemaining = 1;
                else if (value == 0xf2) systemRemaining = 2;
            }
            return;
        }
        if (sysex) return; // Do not allocate or retain SysEx payloads.
        if (systemRemaining > 0) {
            systemRemaining--;
            return;
        }
        if (runningStatus == 0) return;
        int kind = runningStatus & 0xf0;
        if (kind == 0xc0 || kind == 0xd0) {
            listener.onMessage(runningStatus, value, 0);
        } else if (received == 0) {
            first = value;
            received = 1;
        } else {
            received = 0;
            listener.onMessage(runningStatus, first, value);
        }
    }
}
