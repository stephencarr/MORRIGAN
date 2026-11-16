package org.morrigan.mobile;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The 47 original standalone LIRA controls, in upstream gui.link preset order.
 * Values/choices transcribed from Miguel Moreno's BSD-licensed patch at
 * 6a6b6cbc3359a20d7741c9270c7690ab6b21c92a; tests verify them against that source.
 */
public final class LiraControls {
    private LiraControls() { }
    public static final class Spec {
        public final String id, label;
        public final float initial;
        public final int max;
        public final String[] choices;
        private Spec(String id, String label, float initial, int max, String... choices) {
            this.id = id; this.label = label; this.initial = initial; this.max = max;
            this.choices = choices.length == 0 ? null : choices.clone();
        }
        public boolean accepts(float value) {
            return Float.isFinite(value) && value >= 0 && value <= max
                    && (choices == null || value == Math.round(value));
        }
    }
    public static final List<Spec> ALL = Collections.unmodifiableList(Arrays.asList(
        new Spec("tune-1", "TUNE 1", 0.0f, 127),
        new Spec("tune-2", "TUNE 2", 78.0f, 127),
        new Spec("tune-3", "TUNE 3", 74.0f, 127),
        new Spec("tune-4", "TUNE 4", 36.0f, 127),
        new Spec("tune-5", "TUNE 5", 27.0f, 127),
        new Spec("tune-6", "TUNE 6", 57.0f, 127),
        new Spec("tune-7", "TUNE 7", 60.0f, 127),
        new Spec("tune-8", "TUNE 8", 51.0f, 127),
        new Spec("fast-12", "FAST 12", 1.0f, 1, "SLOW", "FAST"),
        new Spec("fast-34", "FAST 34", 1.0f, 1, "SLOW", "FAST"),
        new Spec("fast-56", "FAST 56", 1.0f, 1, "SLOW", "FAST"),
        new Spec("fast-78", "FAST 78", 1.0f, 1, "SLOW", "FAST"),
        new Spec("sharp-12", "SHARP 12", 14.3774f, 127),
        new Spec("sharp-34", "SHARP 34", 43.1321f, 127),
        new Spec("sharp-56", "SHARP 56", 103.038f, 127),
        new Spec("sharp-78", "SHARP 78", 71.8868f, 127),
        new Spec("mod-12", "MOD 12", 0.0f, 127),
        new Spec("mod-34", "MOD 34", 0.0f, 127),
        new Spec("mod-56", "MOD 56", 0.0f, 127),
        new Spec("mod-78", "MOD 78", 0.0f, 127),
        new Spec("source-12", "SOURCE 12", 0.0f, 2, "34", "OFF", "LFO-CV"),
        new Spec("source-34", "SOURCE 34", 0.0f, 2, "12", "OFF", "LFO-CV"),
        new Spec("source-56", "SOURCE 56", 0.0f, 2, "78", "OFF", "LFO-CV"),
        new Spec("source-78", "SOURCE 78", 0.0f, 2, "56", "OFF", "LFO-CV"),
        new Spec("pitch-1234", "PITCH 1234", 66.0f, 127),
        new Spec("pitch-5678", "PITCH 5678", 65.0f, 127),
        new Spec("hold-1234", "HOLD 1234", 0.0f, 127),
        new Spec("hold-5678", "HOLD 5678", 0.0f, 127),
        new Spec("switch", "SWITCH", 0.0f, 1, "NORMAL", "SWAP"),
        new Spec("total-fb", "TOTAL FB", 0.0f, 1, "OFF", "ON"),
        new Spec("vibrato", "VIBRATO", 1.0f, 1, "OFF", "ON"),
        new Spec("drv", "DRV", 86.0f, 127),
        new Spec("dst-mix", "DST MIX", 69.0f, 127),
        new Spec("vol", "VOL", 127.0f, 127),
        new Spec("f-a", "F A", 42.0f, 127),
        new Spec("f-b", "F B", 64.0f, 127),
        new Spec("andor", "ANDOR", 1.0f, 1, "AND", "OR"),
        new Spec("link", "LINK", 1.0f, 1, "OFF", "ON"),
        new Spec("time-1", "TIME 1", 94.5745f, 127),
        new Spec("time-2", "TIME 2", 56.7447f, 127),
        new Spec("feedback", "FEEDBACK", 54.0426f, 127),
        new Spec("del-mix", "DEL MIX", 67.5532f, 127),
        new Spec("mod-1", "MOD 1", 40.7358f, 127),
        new Spec("mod-2", "MOD 2", 47.9245f, 127),
        new Spec("del-mod", "DEL MOD", 2.0f, 2, "SELF", "OFF", "LFO"),
        new Spec("lfo-wav", "LFO WAV", 0.0f, 1, "TRI", "SQR"),
        new Spec("quantize", "QUANTIZE", 0.0f, 1, "OFF", "ON")
    ));
    public static Spec find(String id) {
        for (Spec spec : ALL) if (spec.id.equals(id)) return spec;
        return null;
    }
    /** Preserve the user's master level when restoring the upstream musical preset. */
    public static Map<String, Float> factory(float master) {
        Map<String, Float> values = new LinkedHashMap<>();
        for (Spec spec : ALL) values.put(spec.id, spec.initial);
        values.put("vol", Float.isFinite(master) ? Math.max(0, Math.min(127, master)) : 63.5f);
        return values;
    }
}
