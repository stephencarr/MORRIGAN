package org.morrigan.mobile;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.SeekBar;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowAlertDialog;

/** Actual Android widgets rasterized by Robolectric's native Skia runtime. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE, qualifiers = "w393dp-h820dp-port-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
public final class LiraPanelViewTest {
    private ActivityController<Activity> activity;
    private LiraPanelView panel;
    private Capture capture;
    private Map<String, Float> values;
    private float[] referenceWave;
    private long gestureDownTime;
    private int width = 393, height = 820;

    private static final class ParameterEvent {
        final String id;
        final float value;
        ParameterEvent(String id, float value) { this.id = id; this.value = value; }
    }
    private static final class Capture implements LiraPanelView.Listener {
        final List<ParameterEvent> parameters = new ArrayList<>();
        final List<String> voices = new ArrayList<>();
        int starts, panics, profiles, resets;
        @Override public void onStartStop() { starts++; }
        @Override public void onPanic() { panics++; }
        @Override public void onVoice(int voice, boolean down) { voices.add(voice + ":" + down); }
        @Override public void onParameter(String parameter, float value) { parameters.add(new ParameterEvent(parameter, value)); }
        @Override public void onProfileToggle() { profiles++; }
        @Override public void onFactoryReset() { resets++; }
    }

    @Before public void setup() {
        activity = Robolectric.buildActivity(Activity.class);
        activity.get().setTheme(android.R.style.Theme_Material_NoActionBar);
        activity.create().start().resume().visible();
        activity.get().getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        capture = new Capture();
        values = LiraControls.factory(63.5f);
        referenceWave = referenceWave();
        panel = new LiraPanelView(activity.get());
        panel.setListener(capture);
        activity.get().setContentView(panel);
        update(true, true);
        layout();
    }

    @After public void cleanup() {
        AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        if (activity != null) activity.pause().stop().destroy();
    }

    private void update(boolean running, boolean active) {
        panel.update(referenceWave, running ? "LIRA · 48000 HZ · XRUN 0" : "STOPPED",
                "USB MIDI · TEST CONTROLLER · NOTES", running, active, "notes", values);
    }

    /** Host-rendered LIRA PCM fixture; this is not a Pixel AudioTrack capture. */
    private static float[] referenceWave() {
        List<Float> samples = new ArrayList<>();
        try (InputStream input = LiraPanelViewTest.class.getResourceAsStream("/lira-scope.txt")) {
            assertNotNull("Missing recorded LIRA scope fixture", input);
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                for (String line; (line = reader.readLine()) != null;) {
                    line = line.trim();
                    if (!line.isEmpty() && !line.startsWith("#")) samples.add(Float.parseFloat(line));
                }
            }
        } catch (java.io.IOException error) { throw new AssertionError("Cannot read scope fixture", error); }
        assertEquals("Scope fixture must match display sample count", 512, samples.size());
        float[] result = new float[samples.size()];
        for (int i = 0; i < result.length; i++) result[i] = samples.get(i);
        return result;
    }

    private void layout() {
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        panel.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        panel.layout(0, 0, width, height);
    }

    private View tagged(String tag) {
        View view = panel.findViewWithTag(tag);
        assertNotNull("Missing view " + tag, view);
        return view;
    }

    private void reveal(View view) {
        view.requestRectangleOnScreen(new Rect(0, 0, view.getWidth(), view.getHeight()), true);
        layout();
        Rect visible = new Rect();
        assertTrue("Not visible: " + view.getTag(), view.getGlobalVisibleRect(visible));
        assertTrue("No clickable area: " + view.getTag(), visible.width() > 0 && visible.height() > 0);
    }

    private static void collectParameterTags(View view, Set<String> tags) {
        if (view.getTag() instanceof String && ((String) view.getTag()).startsWith("param:")) {
            assertTrue("Duplicate parameter tag", tags.add((String) view.getTag()));
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) collectParameterTags(group.getChildAt(i), tags);
        }
    }

    private static void touch(View view, int action, float x, float y) {
        long now = SystemClock.uptimeMillis();
        MotionEvent event = MotionEvent.obtain(now, now, action, x, y, 0);
        try { view.dispatchTouchEvent(event); } finally { event.recycle(); }
    }

    private static void touchCenter(View view, int action) {
        touch(view, action, view.getWidth() / 2f, view.getHeight() / 2f);
    }

    private void pointers(int action, int[] ids, View[] targets) {
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[ids.length];
        MotionEvent.PointerCoords[] positions = new MotionEvent.PointerCoords[ids.length];
        for (int i = 0; i < ids.length; i++) {
            properties[i] = new MotionEvent.PointerProperties();
            properties[i].id = ids[i];
            properties[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
            Rect bounds = new Rect(0, 0, targets[i].getWidth(), targets[i].getHeight());
            panel.offsetDescendantRectToMyCoords(targets[i], bounds);
            positions[i] = new MotionEvent.PointerCoords();
            positions[i].x = bounds.exactCenterX();
            positions[i].y = bounds.exactCenterY() - panel.getScrollY();
            positions[i].pressure = 1;
            positions[i].size = 1;
        }
        long now = SystemClock.uptimeMillis();
        if (action == MotionEvent.ACTION_DOWN) gestureDownTime = now;
        MotionEvent event = MotionEvent.obtain(gestureDownTime, now, action, ids.length, properties, positions,
                0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        try { assertTrue(panel.dispatchTouchEvent(event)); } finally { event.recycle(); }
    }

    private AlertDialog parameterDialog(String id) {
        View button = tagged("param:" + id);
        reveal(button);
        assertTrue(button.performClick());
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        AlertDialog dialog = ShadowAlertDialog.getLatestAlertDialog();
        assertNotNull(dialog);
        assertTrue(dialog.isShowing());
        View decor = dialog.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(Math.min(width - 24, 560), View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.AT_MOST));
        decor.layout(0, 0, decor.getMeasuredWidth(), decor.getMeasuredHeight());
        return dialog;
    }

    private static void screenshot(View view, String filename) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        // View.draw is normally entered through a parent that applies this
        // transform. Direct captures must apply it to show the visible viewport.
        canvas.translate(-view.getScrollX(), -view.getScrollY());
        view.draw(canvas);
        Set<Integer> colors = new HashSet<>();
        for (int y = 0; y < bitmap.getHeight(); y += 3)
            for (int x = 0; x < bitmap.getWidth(); x += 3) colors.add(bitmap.getPixel(x, y));
        assertTrue("Native render was blank", colors.size() > 8);
        File directory = new File(System.getProperty("morrigan.screenshotDir", "build/reports/ui-native"));
        assertTrue(directory.isDirectory() || directory.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(directory, filename))) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output));
        }
        bitmap.recycle();
    }

    @Test public void portraitExposesAll47ControlsAndEveryControlEmitsAValidParameter() throws Exception {
        Set<String> tags = new HashSet<>();
        collectParameterTags(panel, tags);
        assertEquals(47, tags.size());
        screenshot(panel, "lira-panel-portrait-393x820.png");
        for (LiraControls.Spec spec : LiraControls.ALL) {
            View button = tagged("param:" + spec.id);
            reveal(button);
            assertTrue(spec.id, button.isEnabled());
            assertTrue("Horizontal overflow " + spec.id, button.getWidth() <= width);
            int before = capture.parameters.size();
            if (spec.choices != null) {
                assertTrue(button.performClick());
            } else {
                AlertDialog dialog = parameterDialog(spec.id);
                View increment = dialog.getWindow().getDecorView().findViewWithTag("increase:" + spec.id);
                assertNotNull("Missing precision action " + spec.id, increment);
                assertTrue(increment.performClick());
                dialog.dismiss();
            }
            assertEquals("No control callback for " + spec.id, before + 1, capture.parameters.size());
            ParameterEvent event = capture.parameters.get(before);
            assertEquals(spec.id, event.id);
            assertTrue(spec.id + " emitted invalid value", spec.accepts(event.value));
        }
        panel.fullScroll(View.FOCUS_DOWN);
        layout();
        screenshot(panel, "lira-panel-portrait-lower.png");
    }

    @Test public void precisionSeekBarEditsAndMidiSnapshotRefreshesVisibleState() throws Exception {
        values.put("feedback", 91f);
        values.put("tune-1", 94f);
        update(true, true);
        assertTrue(((TextView) tagged("param:feedback")).getText().toString().contains("91"));
        assertTrue(((TextView) tagged("param:tune-1")).getContentDescription().toString().contains("94"));
        AlertDialog dialog = parameterDialog("feedback");
        View decor = dialog.getWindow().getDecorView();
        SeekBar slider = decor.findViewWithTag("slider:feedback");
        assertNotNull(slider);
        assertEquals(9100, slider.getProgress());
        assertTrue(slider.getWidth() > 100);
        touch(slider, MotionEvent.ACTION_DOWN, slider.getWidth() * 0.3f, slider.getHeight() / 2f);
        touch(slider, MotionEvent.ACTION_MOVE, slider.getWidth() * 0.4f, slider.getHeight() / 2f);
        touch(slider, MotionEvent.ACTION_UP, slider.getWidth() * 0.4f, slider.getHeight() / 2f);
        assertFalse("Real slider drag produced no callback", capture.parameters.isEmpty());
        ParameterEvent last = capture.parameters.get(capture.parameters.size() - 1);
        assertEquals("feedback", last.id);
        assertTrue(last.value > 20 && last.value < 80);
        values.put("feedback", 17.25f);
        update(true, true);
        assertEquals(1725, slider.getProgress());
        assertEquals("17.25", ((TextView) decor.findViewWithTag("value:feedback")).getText().toString());
        screenshot(decor, "lira-feedback-precision-dialog.png");
    }

    @Test public void actionsAndMomentaryPadsRespectDownUpCancelAndStoppedState() {
        for (String tag : new String[]{"start", "panic", "profile", "reset"}) {
            View action = tagged(tag);
            reveal(action);
            assertTrue(action.performClick());
        }
        assertEquals(1, capture.starts);
        assertEquals(1, capture.panics);
        assertEquals(1, capture.profiles);
        assertEquals(1, capture.resets);
        View one = tagged("voice:1"), two = tagged("voice:2");
        reveal(one);
        touchCenter(one, MotionEvent.ACTION_DOWN);
        touchCenter(two, MotionEvent.ACTION_DOWN);
        assertTrue(one.isSelected());
        assertTrue(two.isSelected());
        touchCenter(one, MotionEvent.ACTION_UP);
        touchCenter(two, MotionEvent.ACTION_CANCEL);
        assertEquals(java.util.Arrays.asList("1:true", "2:true", "1:false", "2:false"), capture.voices);
        assertFalse(one.isSelected());
        assertFalse(two.isSelected());
        update(false, false);
        assertFalse(one.isEnabled());
        assertFalse(tagged("panic").isEnabled());
        assertTrue("Stopped parameter editing must remain available", tagged("param:tune-1").isEnabled());
        touchCenter(one, MotionEvent.ACTION_DOWN);
        assertEquals(4, capture.voices.size());
    }

    @Test public void landscapeControlsRemainInsideThePanelAndCanBeScrolledIntoView() throws Exception {
        // A real orientation change recreates this Activity. Recreate its Window
        // too; resizing only the child would leave portrait clipping bounds.
        activity.pause().stop().destroy();
        RuntimeEnvironment.setQualifiers("w820dp-h393dp-land-mdpi");
        width = 820; height = 393;
        setup();
        panel.scrollTo(0, 0);
        screenshot(panel, "lira-panel-landscape-820x393.png");
        for (LiraControls.Spec spec : LiraControls.ALL) {
            View button = tagged("param:" + spec.id);
            reveal(button);
            Rect local = new Rect(0, 0, button.getWidth(), button.getHeight());
            panel.offsetDescendantRectToMyCoords(button, local);
            assertTrue(spec.id + " extends left", local.left >= 0);
            assertTrue(spec.id + " extends right", local.right <= width);
        }
        View last = tagged("voice:8");
        reveal(last);
        assertTrue("Landscape must scroll to lower controls", panel.getScrollY() > 0);
        screenshot(panel, "lira-panel-landscape-lower.png");
    }

    // Robolectric 4.18's API35 NativeInput.nativeSplit loses coordinate offsets
    // and converts event-time units incorrectly. Exercise Android14's genuine
    // Java framework split here; all other rendering/state tests stay API35.
    // Physical Pixel/Android15 multi-touch validation remains required.
    @Test @Config(sdk = 34)
    public void realViewHierarchySplitsTwoFingerGatesAndMidiFeedbackDoesNotRetrigger() {
        View one = tagged("voice:1"), two = tagged("voice:2");
        reveal(one);
        pointers(MotionEvent.ACTION_DOWN, new int[]{7}, new View[]{one});
        pointers(MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT),
                new int[]{7, 9}, new View[]{one, two});
        pointers(MotionEvent.ACTION_POINTER_UP, new int[]{7, 9}, new View[]{one, two});
        pointers(MotionEvent.ACTION_UP, new int[]{9}, new View[]{two});
        assertEquals(java.util.Arrays.asList("1:true", "2:true", "1:false", "2:false"), capture.voices);
        values.put("sensor-1", 1f);
        update(true, true);
        assertTrue(one.isSelected());
        assertEquals("Feedback must not cause another gate event", 4, capture.voices.size());
        values.put("sensor-1", 0f);
        update(true, true);
        assertFalse(one.isSelected());
        assertEquals(4, capture.voices.size());
    }
}
