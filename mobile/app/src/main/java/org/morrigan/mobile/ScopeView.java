package org.morrigan.mobile;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.SparseIntArray;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityNodeProvider;

/** Original amber instrument display. This view never owns or processes audio. */
public final class ScopeView extends View {
    public interface Listener {
        void onStartStop();
        void onPanic();
        void onVoice(int voice, boolean down);
        void onVolume(float normalized);
        void onProfileToggle();
        void onPinRequested();
    }

    private static final int START = 1, PANIC = 2, PROFILE = 3, PIN = 4, VOLUME = 5;
    private static final int FIRST_VOICE = 10, NONE = -1;
    private static final int[] ACCESSIBLE_IDS = {START, PANIC, PROFILE, PIN, VOLUME,
            10, 11, 12, 13, 14, 15, 16, 17};
    private static final int BLACK = Color.rgb(16, 10, 3);
    private static final int PANEL = Color.rgb(30, 20, 6);
    private static final int AMBER = Color.rgb(247, 188, 77);
    private static final int DIM = Color.rgb(123, 88, 31);
    private static final int GRID = Color.rgb(65, 46, 16);

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path trace = new Path();
    private final RectF window = new RectF(), plot = new RectF();
    private final RectF[] controls = new RectF[18];
    private final SparseIntArray pointers = new SparseIntArray();
    private final int[] voiceHolds = new int[8];
    private final float[] waveform = new float[512];
    private final float density;
    private final AccessibilityManager accessibility;
    private final Nodes nodes = new Nodes();
    private Listener listener;
    private int sampleCount, hovered = NONE, accessibilityFocus = NONE, keyboardFocus = START;
    private long voiceGeneration;
    private boolean running;
    private String audioStatus = "ENGINE STOPPED", midiStatus = "USB MIDI: CONNECT A CONTROLLER";
    private String profile = "notes";
    private float volume = 0.35f, statusTop;

    public ScopeView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        accessibility = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        for (int i = 0; i < controls.length; i++) controls[i] = new RectF();
        paint.setTypeface(Typeface.MONOSPACE);
        setFocusable(true);
        setFocusableInTouchMode(true);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        setContentDescription("MORRIGAN Mobile instrument and oscilloscope");
    }

    public void setListener(Listener listener) {
        releaseVoices();
        this.listener = listener;
    }

    /** Called on the UI thread. Copies at most 512 visualization samples. */
    public void update(float[] samples, String audioStatus, String midiStatus,
                       boolean running, String profile, float volume) {
        String nextAudio = audioStatus == null ? "ENGINE STATUS UNAVAILABLE" : audioStatus;
        String nextMidi = midiStatus == null ? "USB MIDI STATUS UNAVAILABLE" : midiStatus;
        String nextProfile = "lcxl".equals(profile) ? "lcxl" : "notes";
        boolean stateChanged = this.running != running || !this.audioStatus.equals(nextAudio)
                || !this.midiStatus.equals(nextMidi) || !this.profile.equals(nextProfile);
        if (this.running && !running) releaseVoices();
        this.running = running;
        this.audioStatus = nextAudio;
        this.midiStatus = nextMidi;
        this.profile = nextProfile;
        this.volume = finiteUnit(volume);
        sampleCount = samples == null ? 0 : Math.min(waveform.length, samples.length);
        for (int i = 0; i < sampleCount; i++) {
            float value = samples[i * samples.length / sampleCount];
            waveform[i] = Float.isFinite(value) ? Math.max(-1f, Math.min(1f, value)) : 0f;
        }
        invalidate();
        if (stateChanged) sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED);
    }

    private float dp(float value) { return value * density; }
    private static float finiteUnit(float value) {
        return Float.isFinite(value) ? Math.max(0f, Math.min(1f, value)) : 0f;
    }

    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        releaseVoices();
        pointers.clear();
        float margin = dp(10), gap = dp(6), row = dp(44);
        window.set(margin, dp(42), width - margin, height - margin);
        float left = window.left + margin, right = window.right - margin;
        float bottom = window.bottom - margin;
        controls[VOLUME].set(left, bottom - row, right, bottom);
        bottom -= row + gap;
        float buttonWidth = (right - left - 3 * gap) / 4;
        for (int id = START; id <= PIN; id++) {
            float x = left + (id - START) * (buttonWidth + gap);
            controls[id].set(x, bottom - row, x + buttonWidth, bottom);
        }
        bottom -= row + dp(12);
        int columns = right - left >= dp(380) ? 8 : 4;
        int rows = 8 / columns;
        float padWidth = (right - left - (columns - 1) * gap) / columns;
        float padTop = bottom - rows * row - (rows - 1) * gap;
        for (int voice = 0; voice < 8; voice++) {
            float x = left + (voice % columns) * (padWidth + gap);
            float y = padTop + (voice / columns) * (row + gap);
            controls[FIRST_VOICE + voice].set(x, y, x + padWidth, y + row);
        }
        statusTop = padTop - dp(48);
        plot.set(left, window.top + dp(36), right, Math.max(window.top + dp(68), statusTop - dp(8)));
    }

    @Override protected void onDraw(Canvas canvas) {
        canvas.drawColor(BLACK);
        fill(canvas, new RectF(0, 0, getWidth(), dp(31)), AMBER);
        text(canvas, "MORRIGAN", dp(12), dp(21), 14, BLACK);
        String brand = "MOBILE";
        paint.setTextSize(dp(11));
        text(canvas, brand, getWidth() - dp(12) - paint.measureText(brand), dp(20), 11, BLACK);
        fill(canvas, window, PANEL);
        border(canvas, window, AMBER, 1.5f);
        fill(canvas, new RectF(window.left, window.top, window.right, window.top + dp(27)), AMBER);
        text(canvas, "OSCILLOSCOPE", window.left + dp(10), window.top + dp(19), 12, BLACK);
        text(canvas, running ? "RUN" : "IDLE", window.right - dp(47), window.top + dp(19), 11, BLACK);
        drawScope(canvas);
        textFit(canvas, audioStatus.toUpperCase(java.util.Locale.ROOT), plot.left,
                statusTop + dp(13), plot.width(), 10, AMBER);
        textFit(canvas, midiStatus.toUpperCase(java.util.Locale.ROOT), plot.left,
                statusTop + dp(31), plot.width(), 10, DIM);
        for (int voice = 0; voice < 8; voice++) {
            drawButton(canvas, FIRST_VOICE + voice, Integer.toString(voice + 1), voiceHolds[voice] > 0);
        }
        drawButton(canvas, START, running || audioStatus.startsWith("STARTING") ? "STOP" : "START", running);
        drawButton(canvas, PANIC, "PANIC", false);
        drawButton(canvas, PROFILE, "lcxl".equals(profile) ? "LCXL MK2" : "MIDI NOTES", false);
        drawButton(canvas, PIN, "PIN", false);
        drawVolume(canvas);
        if (accessibilityFocus != NONE) drawFocus(canvas, accessibilityFocus);
        else if (isFocused() && !isInTouchMode()) drawFocus(canvas, keyboardFocus);
    }

    private void drawScope(Canvas canvas) {
        fill(canvas, plot, BLACK);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dp(1));
        paint.setColor(GRID);
        for (int i = 1; i < 8; i++) {
            float x = plot.left + plot.width() * i / 8f;
            canvas.drawLine(x, plot.top, x, plot.bottom, paint);
        }
        for (int i = 1; i < 4; i++) {
            float y = plot.top + plot.height() * i / 4f;
            canvas.drawLine(plot.left, y, plot.right, y, paint);
        }
        border(canvas, plot, DIM, 1);
        trace.reset();
        float middle = plot.centerY();
        float peak = 0f;
        for (int i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(waveform[i]));
        float displayGain = peak > 0.0001f ? Math.max(1f, Math.min(16f, 0.8f / peak)) : 1f;
        if (!running || sampleCount < 2) {
            trace.moveTo(plot.left, middle);
            trace.lineTo(plot.right, middle);
        } else {
            for (int i = 0; i < sampleCount; i++) {
                float x = plot.left + plot.width() * i / (sampleCount - 1f);
                float y = middle - waveform[i] * displayGain * plot.height() * 0.44f;
                if (i == 0) trace.moveTo(x, y); else trace.lineTo(x, y);
            }
        }
        paint.setColor(AMBER);
        paint.setStrokeWidth(dp(1.5f));
        paint.setStyle(Paint.Style.STROKE);
        canvas.drawPath(trace, paint);
        text(canvas, "OUTPUT  DISPLAY " + Math.round(displayGain) + "X", plot.left + dp(6), plot.top + dp(13), 9, DIM);
    }

    private void drawButton(Canvas canvas, int id, String label, boolean pressed) {
        RectF rect = controls[id];
        int ink = enabled(id) ? AMBER : DIM;
        fill(canvas, rect, pressed ? ink : BLACK);
        border(canvas, rect, ink, 1.5f);
        float size = id >= FIRST_VOICE ? 16 : 10;
        paint.setTextSize(dp(size));
        text(canvas, label, rect.centerX() - paint.measureText(label) / 2,
                rect.centerY() - (paint.ascent() + paint.descent()) / 2, size, pressed ? BLACK : ink);
    }

    private void drawVolume(Canvas canvas) {
        RectF rect = controls[VOLUME];
        text(canvas, "MASTER", rect.left, rect.centerY() + dp(4), 10, AMBER);
        float start = rect.left + dp(62), end = rect.right - dp(39), y = rect.centerY();
        paint.setColor(DIM);
        paint.setStrokeWidth(dp(2));
        canvas.drawLine(start, y, end, y, paint);
        float x = start + volume * Math.max(1, end - start);
        fill(canvas, new RectF(x - dp(5), y - dp(10), x + dp(5), y + dp(10)), AMBER);
        text(canvas, Math.round(volume * 100) + "%", rect.right - dp(34), y + dp(4), 10, AMBER);
    }

    private void drawFocus(Canvas canvas, int id) {
        RectF rect = new RectF(controls[id]);
        rect.inset(-dp(3), -dp(3));
        border(canvas, rect, AMBER, 1);
    }

    private void fill(Canvas canvas, RectF rect, int color) {
        paint.setColor(color); paint.setStyle(Paint.Style.FILL); canvas.drawRect(rect, paint);
    }
    private void border(Canvas canvas, RectF rect, int color, float width) {
        paint.setColor(color); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(width));
        canvas.drawRect(rect, paint);
    }
    private void text(Canvas canvas, String text, float x, float baseline, float size, int color) {
        paint.setStyle(Paint.Style.FILL); paint.setColor(color); paint.setTextSize(dp(size));
        canvas.drawText(text, x, baseline, paint);
    }
    private void textFit(Canvas canvas, String value, float x, float y, float width, float size, int color) {
        paint.setTextSize(dp(size));
        if (paint.measureText(value) > width) {
            int end = Math.max(0, paint.breakText(value, true, Math.max(0, width - paint.measureText("…")), null));
            value = value.substring(0, end) + "…";
        }
        text(canvas, value, x, y, size, color);
    }

    private boolean enabled(int id) { return running || (id != PANIC && id < FIRST_VOICE); }
    private int hit(float x, float y, boolean includeDisabled) {
        for (int id : ACCESSIBLE_IDS)
            if ((includeDisabled || enabled(id)) && controls[id].contains(x, y)) return id;
        return NONE;
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        int action = event.getActionMasked(), index = event.getActionIndex();
        int pointer = event.getPointerId(index);
        if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) {
            int id = hit(event.getX(index), event.getY(index), false);
            pointers.put(pointer, id);
            if (id >= FIRST_VOICE) pressVoice(id - FIRST_VOICE);
            if (id == VOLUME) changeVolume(event.getX(index));
            if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
        } else if (action == MotionEvent.ACTION_MOVE) {
            for (int i = 0; i < event.getPointerCount(); i++) {
                int p = event.getPointerId(i), id = pointers.get(p, NONE);
                if (id == VOLUME) changeVolume(event.getX(i));
                else if (id != NONE && !controls[id].contains(event.getX(i), event.getY(i))) {
                    if (id >= FIRST_VOICE) releaseVoice(id - FIRST_VOICE);
                    pointers.put(p, NONE);
                }
            }
        } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP) {
            int id = pointers.get(pointer, NONE);
            pointers.delete(pointer);
            if (id >= FIRST_VOICE) releaseVoice(id - FIRST_VOICE);
            else if (id != NONE && id != VOLUME && controls[id].contains(event.getX(index), event.getY(index))) {
                performClick(); activate(id);
            }
        } else if (action == MotionEvent.ACTION_CANCEL) {
            pointers.clear(); releaseVoices();
        }
        invalidate();
        return true;
    }

    @Override public boolean performClick() { super.performClick(); return true; }

    private void pressVoice(int voice) {
        if (!running || listener == null) return;
        if (voiceHolds[voice]++ == 0) listener.onVoice(voice + 1, true);
        invalidate();
    }
    private void releaseVoice(int voice) {
        if (voiceHolds[voice] > 0 && --voiceHolds[voice] == 0 && listener != null)
            listener.onVoice(voice + 1, false);
        invalidate();
    }
    private void releaseVoices() {
        voiceGeneration++;
        for (int voice = 0; voice < voiceHolds.length; voice++) {
            if (voiceHolds[voice] > 0 && listener != null) listener.onVoice(voice + 1, false);
            voiceHolds[voice] = 0;
        }
        pointers.clear();
    }
    private void changeVolume(float x) {
        RectF rect = controls[VOLUME];
        setVolume((x - rect.left - dp(62)) / Math.max(1, rect.width() - dp(101)));
    }
    private void setVolume(float next) {
        volume = finiteUnit(next);
        if (listener != null) listener.onVolume(volume);
        invalidate();
    }
    private boolean activate(int id) {
        if (listener == null || !enabled(id)) return false;
        if (id == START) { releaseVoices(); listener.onStartStop(); }
        else if (id == PANIC) { releaseVoices(); listener.onPanic(); }
        else if (id == PROFILE) { releaseVoices(); listener.onProfileToggle(); }
        else if (id == PIN) { releaseVoices(); listener.onPinRequested(); }
        else if (id >= FIRST_VOICE) {
            final int voice = id - FIRST_VOICE;
            final long generation = voiceGeneration;
            pressVoice(voice);
            postDelayed(() -> { if (generation == voiceGeneration) releaseVoice(voice); }, 180);
        } else return false;
        sendVirtualEvent(id, AccessibilityEvent.TYPE_VIEW_CLICKED);
        invalidate();
        return true;
    }

    @Override protected void onDetachedFromWindow() { releaseVoices(); super.onDetachedFromWindow(); }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        if (!hasFocus) releaseVoices();
        super.onWindowFocusChanged(hasFocus);
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_TAB || keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
            int position = 0;
            while (position < ACCESSIBLE_IDS.length && ACCESSIBLE_IDS[position] != keyboardFocus) position++;
            int direction = keyCode == KeyEvent.KEYCODE_DPAD_LEFT || event.isShiftPressed() ? -1 : 1;
            do { position = (position + direction + ACCESSIBLE_IDS.length) % ACCESSIBLE_IDS.length; }
            while (!enabled(ACCESSIBLE_IDS[position]));
            keyboardFocus = ACCESSIBLE_IDS[position];
            invalidate(); return true;
        }
        if (keyboardFocus == VOLUME && (keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_DPAD_DOWN)) {
            setVolume(volume + (keyCode == KeyEvent.KEYCODE_DPAD_UP ? 0.05f : -0.05f)); return true;
        }
        if (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_SPACE)
            return true;
        return super.onKeyDown(keyCode, event);
    }
    @Override public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_SPACE)
            return activate(keyboardFocus);
        return super.onKeyUp(keyCode, event);
    }

    @Override public AccessibilityNodeProvider getAccessibilityNodeProvider() { return nodes; }
    @Override public boolean onHoverEvent(MotionEvent event) {
        if (accessibility != null && accessibility.isTouchExplorationEnabled()) {
            int next = event.getActionMasked() == MotionEvent.ACTION_HOVER_EXIT ? NONE : hit(event.getX(), event.getY(), true);
            if (next != hovered) {
                if (hovered != NONE) sendVirtualEvent(hovered, AccessibilityEvent.TYPE_VIEW_HOVER_EXIT);
                hovered = next;
                if (hovered != NONE) sendVirtualEvent(hovered, AccessibilityEvent.TYPE_VIEW_HOVER_ENTER);
            }
            return true;
        }
        return super.onHoverEvent(event);
    }
    private String label(int id) {
        if (id == START) return running ? "Stop instrument" : "Start instrument";
        if (id == PANIC) return "Panic: silence and stop the instrument";
        if (id == PROFILE) return "MIDI profile: " + ("lcxl".equals(profile) ? "Launch Control XL Mark 2" : "standard notes") + ". Switch profile";
        if (id == PIN) return "Pin instrument screen";
        if (id == VOLUME) return "Master volume " + Math.round(volume * 100) + " percent";
        return "Audition voice " + (id - FIRST_VOICE + 1);
    }
    private void sendVirtualEvent(int id, int type) {
        if (accessibility == null || !accessibility.isEnabled() || getParent() == null) return;
        AccessibilityEvent event = AccessibilityEvent.obtain(type);
        event.setPackageName(getContext().getPackageName());
        event.setClassName(id == VOLUME ? "android.widget.SeekBar" : "android.widget.Button");
        event.setSource(this, id);
        event.setEnabled(enabled(id));
        event.getText().add(label(id));
        getParent().requestSendAccessibilityEvent(this, event);
    }

    private final class Nodes extends AccessibilityNodeProvider {
        @Override public AccessibilityNodeInfo createAccessibilityNodeInfo(int id) {
            if (id == HOST_VIEW_ID) {
                AccessibilityNodeInfo node = AccessibilityNodeInfo.obtain(ScopeView.this);
                onInitializeAccessibilityNodeInfo(node);
                node.setClassName("android.view.ViewGroup");
                node.setContentDescription("MORRIGAN instrument. " + audioStatus + ". " + midiStatus);
                for (int child : ACCESSIBLE_IDS) node.addChild(ScopeView.this, child);
                return node;
            }
            boolean known = false;
            for (int candidate : ACCESSIBLE_IDS) if (candidate == id) known = true;
            if (!known) return null;
            AccessibilityNodeInfo node = AccessibilityNodeInfo.obtain();
            node.setPackageName(getContext().getPackageName());
            node.setSource(ScopeView.this, id);
            node.setParent(ScopeView.this);
            node.setClassName(id == VOLUME ? "android.widget.SeekBar" : "android.widget.Button");
            node.setContentDescription(label(id));
            node.setEnabled(enabled(id));
            node.setFocusable(true);
            node.setFocused(keyboardFocus == id && isFocused());
            node.setAccessibilityFocused(accessibilityFocus == id);
            node.setVisibleToUser(isShown());
            Rect rect = new Rect(); controls[id].roundOut(rect);
            node.setBoundsInParent(rect);
            int[] location = new int[2]; getLocationOnScreen(location);
            rect.offset(location[0], location[1]); node.setBoundsInScreen(rect);
            node.addAction(AccessibilityNodeInfo.ACTION_FOCUS);
            node.addAction(accessibilityFocus == id ? AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS : AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS);
            if (enabled(id)) {
                if (id == VOLUME) {
                    node.setRangeInfo(AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT, 0, 1, volume));
                    node.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS);
                    node.addAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
                    node.addAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);
                } else {
                    node.setClickable(true);
                    node.addAction(AccessibilityNodeInfo.ACTION_CLICK);
                }
            }
            return node;
        }
        @Override public AccessibilityNodeInfo findFocus(int focus) {
            int id = focus == AccessibilityNodeInfo.FOCUS_ACCESSIBILITY ? accessibilityFocus : keyboardFocus;
            return id == NONE ? null : createAccessibilityNodeInfo(id);
        }
        @Override public boolean performAction(int id, int action, Bundle args) {
            if (id == HOST_VIEW_ID) return ScopeView.this.performAccessibilityAction(action, args);
            boolean known = false;
            for (int candidate : ACCESSIBLE_IDS) if (candidate == id) known = true;
            if (!known) return false;
            if (action == AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS) {
                if (accessibilityFocus != NONE) sendVirtualEvent(accessibilityFocus, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED);
                accessibilityFocus = id;
                sendVirtualEvent(id, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED);
                invalidate(); return true;
            }
            if (action == AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS) {
                if (accessibilityFocus != id) return false;
                accessibilityFocus = NONE;
                sendVirtualEvent(id, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED);
                invalidate(); return true;
            }
            if (action == AccessibilityNodeInfo.ACTION_FOCUS) {
                requestFocus(); keyboardFocus = id; invalidate(); return true;
            }
            if (!enabled(id)) return false;
            if (action == AccessibilityNodeInfo.ACTION_CLICK) return activate(id);
            if (id == VOLUME) {
                if (action == AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId() && args != null
                        && args.containsKey(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE)) {
                    setVolume(args.getFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE));
                } else if (action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) setVolume(volume + 0.05f);
                else if (action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) setVolume(volume - 0.05f);
                else return false;
                sendVirtualEvent(id, AccessibilityEvent.TYPE_VIEW_SELECTED);
                return true;
            }
            return false;
        }
    }
}
