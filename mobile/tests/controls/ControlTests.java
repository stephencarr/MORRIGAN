package org.morrigan.mobile;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class ControlTests {
    public static void main(String[] args) {
        Set<String> ids = new HashSet<>();
        if (LiraControls.ALL.size() != 47) throw new AssertionError("Complete upstream controls required");
        for (LiraControls.Spec spec : LiraControls.ALL) {
            if (!ids.add(spec.id) || !spec.accepts(spec.initial)) throw new AssertionError(spec.id);
            if (spec.accepts(-1) || spec.accepts(spec.max + 1) || spec.accepts(Float.NaN)
                    || spec.accepts(Float.POSITIVE_INFINITY)) throw new AssertionError("Validation: " + spec.id);
            if (spec.choices != null && spec.accepts(0.5f)) throw new AssertionError("Discrete control: " + spec.id);
            System.out.println(spec.id + "=" + spec.initial + "," + spec.max);
        }
        if (LiraControls.find("unknown") != null || LiraControls.find(null) != null) throw new AssertionError("Unknown ID");
        Map<String, Float> first = LiraControls.factory(32);
        Map<String, Float> second = LiraControls.factory(64);
        first.put("tune-1", 99f);
        if (second.get("tune-1") != LiraControls.find("tune-1").initial
                || first.get("vol") != 32 || second.get("vol") != 64) throw new AssertionError("Independent preset/master");
        if (LiraControls.factory(Float.NaN).get("vol") != 63.5f) throw new AssertionError("Invalid master");
        System.out.println("PASS 47 validated controls, independent factory state, master preservation");
    }
}
