package org.morrigan.mobile;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Looper;
import java.time.Duration;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

/** Service state only: these tests deliberately never start libpd or AudioTrack. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
public final class InstrumentStateTest {
    private ServiceController<InstrumentService> controller;
    private InstrumentService service;

    @Before public void setup() {
        RuntimeEnvironment.getApplication().getSharedPreferences("instrument", Context.MODE_PRIVATE)
                .edit().clear().commit();
        controller = Robolectric.buildService(InstrumentService.class).create();
        service = controller.get();
    }

    @After public void cleanup() {
        if (controller != null) controller.destroy();
    }

    @Test public void stoppedEditsAndMidiUpdateTheDisplayedStateWithoutStartingAudio() {
        assertFalse(service.active());
        service.setParameter("feedback", 91);
        service.setParameter("source-12", 2);
        service.onControl("tune-5", 11);
        service.onControl("vol", 80);
        Map<String, Float> values = service.values();
        assertEquals(91f, values.get("feedback"), 0f);
        assertEquals(2f, values.get("source-12"), 0f);
        assertEquals(11f, values.get("tune-5"), 0f);
        assertEquals(80f, values.get("vol"), 0f);
        assertEquals(80f / 127f, service.volume(), 0.00001f);
        assertFalse(service.active());
        assertFalse(service.running());
    }

    @Test public void factoryResetRestoresAll47ParametersAndPreservesMasterLevel() {
        service.setParameter("vol", 23.5f);
        service.setParameter("feedback", 1);
        service.setParameter("tune-1", 80);
        service.setParameter("hold-1234", 127);
        service.restoreFactory();
        Map<String, Float> values = service.values();
        Map<String, Float> factory = LiraControls.factory(23.5f);
        assertEquals(47, factory.size());
        for (LiraControls.Spec spec : LiraControls.ALL) {
            assertEquals(spec.id, factory.get(spec.id), values.get(spec.id));
        }
        for (int voice = 1; voice <= 8; voice++) assertEquals(0f, values.get("sensor-" + voice), 0f);
        assertEquals(23.5f / 127f, service.volume(), 0.00001f);
        assertFalse(service.active());
    }

    @Test public void invalidParameterValuesAreRejectedWithoutChangingState() {
        Map<String, Float> before = service.values();
        service.setParameter("tune-1", Float.NaN);
        service.setParameter("tune-1", Float.POSITIVE_INFINITY);
        service.setParameter("feedback", -1);
        service.setParameter("feedback", 128);
        service.setParameter("vibrato", 0.5f);
        service.setParameter("del-mod", 3);
        service.setParameter("unknown", 25);
        service.setParameter(null, 25);
        assertEquals(before, service.values());
    }

    @Test public void editedParametersAndProfileSurviveServiceRecreation() {
        service.setParameter("time-1", 102.5f);
        service.setParameter("vol", 31f);
        service.toggleProfile();
        Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(600));
        controller.destroy();
        controller = Robolectric.buildService(InstrumentService.class).create();
        service = controller.get();
        assertEquals(102.5f, service.values().get("time-1"), 0f);
        assertEquals(31f, service.values().get("vol"), 0f);
        assertEquals("lcxl", service.profile());
        assertFalse(service.active());
        assertFalse(service.running());
    }
}
