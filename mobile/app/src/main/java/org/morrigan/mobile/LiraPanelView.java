package org.morrigan.mobile;

import android.app.AlertDialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.text.TextUtils;
import android.util.SparseBooleanArray;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** The complete LIRA panel, using original Android widgets and the upstream control model. */
public final class LiraPanelView extends ScrollView {
    public interface Listener {
        void onStartStop();
        void onPanic();
        void onVoice(int voice, boolean down);
        void onParameter(String parameter, float value);
        void onProfileToggle();
        void onFactoryReset();
    }

    private static final int BLACK = Color.rgb(16, 10, 3);
    private static final int PANEL = Color.rgb(31, 21, 7);
    private static final int AMBER = Color.rgb(247, 188, 77);
    private static final int DIM = Color.rgb(135, 99, 38);
    private static final int GRID = Color.rgb(65, 46, 16);
    private final Map<String, ParameterButton> parameterButtons = new LinkedHashMap<>();
    private final Map<String, Float> values = new LinkedHashMap<>();
    private final VoicePad[] pads = new VoicePad[8];
    private final MiniScope scope;
    private final TextView audioText, midiText;
    private final Button start, panic, profileButton, reset;
    private Listener listener;
    private boolean ready, running, active;
    private String profile = "notes";
    private AlertDialog editor;
    private AlertDialog statusDialog;
    private LiraControls.Spec editing;
    private SeekBar editSlider;
    private TextView editValue;
    private boolean editingTouch;

    public LiraPanelView(Context context) {
        super(context);
        setMotionEventSplittingEnabled(true);
        setFillViewport(false);
        setBackgroundColor(BLACK);
        setClipToPadding(false);
        setVerticalScrollBarEnabled(true);
        LinearLayout panel = column();
        panel.setPadding(dp(8), dp(5), dp(8), dp(8));
        addView(panel, new ScrollView.LayoutParams(-1, -2));

        TextView title = text("MORRIGAN  /  LIRA•8", 14, AMBER);
        title.setTextColor(BLACK);
        title.setBackgroundColor(AMBER);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setPadding(dp(6), dp(2), dp(6), dp(2));
        panel.addView(title, new LinearLayout.LayoutParams(-1, -2));
        scope = new MiniScope(context);
        scope.setTag("scope");
        scope.setContentDescription("Live audio output oscilloscope; display gain does not change the sound");
        LinearLayout.LayoutParams scopeLayout = new LinearLayout.LayoutParams(-1, dp(48));
        scopeLayout.topMargin = dp(4);
        panel.addView(scope, scopeLayout);
        audioText = text("CONNECTING TO INSTRUMENT", 9, AMBER);
        audioText.setTag("audio-status");
        midiText = text("USB MIDI: CONNECT A CONTROLLER", 9, DIM);
        midiText.setTag("midi-status");
        audioText.setMaxLines(1); audioText.setEllipsize(TextUtils.TruncateAt.END);
        midiText.setMaxLines(1); midiText.setEllipsize(TextUtils.TruncateAt.END);
        audioText.setOnClickListener(view -> showStatus());
        midiText.setOnClickListener(view -> showStatus());
        panel.addView(audioText);
        panel.addView(midiText);

        LinearLayout actions = row();
        start = action("START", "start", () -> { releaseVoices(); if (listener != null) listener.onStartStop(); });
        panic = action("PANIC", "panic", () -> { releaseVoices(); if (listener != null) listener.onPanic(); });
        profileButton = action("NOTES", "profile", () -> { releaseVoices(); if (listener != null) listener.onProfileToggle(); });
        reset = action("LIRA RESET", "reset", () -> { releaseVoices(); if (listener != null) listener.onFactoryReset(); });
        reset.setContentDescription("Restore the LIRA factory sound, keeping the current master volume");
        reset.setTooltipText("Restore the LIRA factory sound; keep master volume");
        for (Button button : new Button[]{start, panic, profileButton, reset}) addWeighted(actions, button);
        addSection(panel, actions, 3);

        // The top row follows the upstream Hyper-LFO / Mod-Delay / Distortion grouping.
        LinearLayout effects = row();
        LinearLayout lfo = group("HYPER-LFO");
        parameterGrid(lfo, 2, "f-a", "f-b", "andor", "link");
        LinearLayout delay = group("MOD-DELAY");
        parameterGrid(delay, 2, "mod-1", "time-1", "mod-2", "time-2", "del-mod", "feedback", "lfo-wav", "del-mix");
        LinearLayout drive = group("DISTORTION");
        parameterGrid(drive, 1, "drv", "dst-mix", "vol");
        addWeighted(effects, lfo, 1f);
        addWeighted(effects, delay, 2f);
        addWeighted(effects, drive, 1f);
        addSection(panel, effects, 4);

        LinearLayout globals = row();
        for (String id : new String[]{"total-fb", "vibrato", "switch", "quantize"}) addWeighted(globals, parameter(id));
        addSection(panel, globals, 3);

        LinearLayout groups = row();
        for (String groupId : new String[]{"1234", "5678"}) {
            LinearLayout group = group("VOICES " + (groupId.equals("1234") ? "1–4" : "5–8"));
            parameterGrid(group, 2, "hold-" + groupId, "pitch-" + groupId);
            addWeighted(groups, group);
        }
        addSection(panel, groups, 3);

        LinearLayout voices = row();
        String[] pairs = {"12", "34", "56", "78"};
        for (int pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
            String pair = pairs[pairIndex];
            LinearLayout voicePair = group("PAIR " + pair.charAt(0) + "–" + pair.charAt(1));
            parameterGrid(voicePair, 1, "source-" + pair, "mod-" + pair, "sharp-" + pair, "fast-" + pair);
            LinearLayout tunes = row();
            for (int offset = 0; offset < 2; offset++) {
                ParameterButton tune = parameter("tune-" + (pairIndex * 2 + offset + 1));
                tune.setMinimumHeight(dp(44));
                tune.setMinHeight(dp(44));
                addWeighted(tunes, tune);
            }
            voicePair.addView(tunes);
            LinearLayout touch = row();
            for (int offset = 0; offset < 2; offset++) {
                int voice = pairIndex * 2 + offset + 1;
                pads[voice - 1] = new VoicePad(context, voice);
                addWeighted(touch, pads[voice - 1]);
            }
            voicePair.addView(touch);
            addWeighted(voices, voicePair);
        }
        addSection(panel, voices, 3);

        if (parameterButtons.size() != LiraControls.ALL.size())
            throw new IllegalStateException("Panel must expose every original LIRA parameter");
        for (LiraControls.Spec spec : LiraControls.ALL) {
            if (!parameterButtons.containsKey(spec.id)) throw new IllegalStateException("Missing LIRA control " + spec.id);
            values.put(spec.id, spec.initial);
        }
        refreshControls();
    }

    public void setListener(Listener listener) {
        releaseVoices();
        this.listener = listener;
        refreshControls();
    }

    /** UI-thread snapshot; no engine calls, audio ownership or retained mutable sample arrays. */
    public void update(float[] samples, String audioStatus, String midiStatus,
                       boolean running, boolean active, String profile, Map<String, Float> snapshot) {
        if (this.running && !running) releaseVoices();
        this.running = running;
        this.active = active;
        this.profile = "lcxl".equals(profile) ? "lcxl" : "notes";
        ready = snapshot != null && !snapshot.isEmpty();
        if (snapshot != null) {
            for (LiraControls.Spec spec : LiraControls.ALL) {
                Float value = snapshot.get(spec.id);
                if (value != null && Float.isFinite(value)) values.put(spec.id, clamp(value, spec.max));
            }
            for (int voice = 1; voice <= 8; voice++) {
                Float gate = snapshot.get("sensor-" + voice);
                pads[voice - 1].setRemoteHeld(running && gate != null && gate > 0f);
            }
        }
        setTextIfChanged(audioText, audioStatus == null ? "ENGINE STATUS UNAVAILABLE" : audioStatus);
        setTextIfChanged(midiText, midiStatus == null ? "USB MIDI STATUS UNAVAILABLE" : midiStatus);
        scope.update(samples, running);
        refreshControls();
        if (editing != null && editSlider != null && !editingTouch) {
            float value = value(editing);
            editSlider.setProgress(Math.round(value * 100));
            editValue.setText(format(value));
        }
    }

    private void refreshControls() {
        boolean connected = ready && listener != null;
        start.setEnabled(connected);
        setTextIfChanged(start, active ? "STOP" : "START");
        setDescriptionIfChanged(start, active ? "Stop instrument" : "Start instrument");
        panic.setEnabled(connected && active);
        profileButton.setEnabled(connected);
        setTextIfChanged(profileButton, "lcxl".equals(profile) ? "LCXL MK2" : "NOTES");
        setDescriptionIfChanged(profileButton, "MIDI profile " + ("lcxl".equals(profile) ? "Launch Control XL Mark 2" : "standard notes") + "; switch profile");
        reset.setEnabled(connected);
        for (ParameterButton button : parameterButtons.values()) {
            button.setEnabled(connected);
            button.showValue();
        }
        for (VoicePad pad : pads) if (pad != null) pad.setEnabled(connected && running);
    }

    private float value(LiraControls.Spec spec) { return values.containsKey(spec.id) ? values.get(spec.id) : spec.initial; }
    private static float clamp(float value, float max) { return Math.max(0f, Math.min(max, value)); }
    private static String format(float value) {
        if (Math.abs(value - Math.round(value)) < 0.005f) return Integer.toString(Math.round(value));
        return String.format(Locale.ROOT, "%.2f", value);
    }
    private void change(LiraControls.Spec spec, float value) {
        if (!ready || listener == null || !Float.isFinite(value)) return;
        value = clamp(value, spec.max);
        if (spec.choices != null) value = Math.round(value);
        values.put(spec.id, value);
        parameterButtons.get(spec.id).showValue();
        listener.onParameter(spec.id, value);
        if (editing == spec && editValue != null) editValue.setText(format(value));
    }
    private static void setTextIfChanged(TextView view, String value) {
        if (!value.contentEquals(view.getText())) view.setText(value);
    }
    private static void setDescriptionIfChanged(View view, String value) {
        if (!TextUtils.equals(value, view.getContentDescription())) view.setContentDescription(value);
    }

    private void showStatus() {
        if (statusDialog != null) statusDialog.dismiss();
        statusDialog = new AlertDialog.Builder(getContext()).setTitle("INSTRUMENT STATUS")
                .setMessage(audioText.getText() + "\n\n" + midiText.getText())
                .setPositiveButton("DONE", null).create();
        statusDialog.setOnDismissListener(dialog -> { if (statusDialog == dialog) statusDialog = null; });
        statusDialog.show();
    }

    private void openEditor(LiraControls.Spec spec) {
        if (!ready || listener == null) return;
        releaseVoices();
        if (editor != null) editor.dismiss();
        if (spec.choices != null) {
            editor = new AlertDialog.Builder(getContext()).setTitle(spec.label)
                    .setSingleChoiceItems(spec.choices, Math.round(value(spec)), (dialog, which) -> {
                        change(spec, which); dialog.dismiss();
                    }).setNegativeButton("CLOSE", null).create();
        } else {
            editing = spec;
            LinearLayout body = column();
            body.setPadding(dp(18), dp(12), dp(18), dp(12));
            body.setBackgroundColor(PANEL);
            editValue = text(format(value(spec)), 24, AMBER);
            editValue.setGravity(Gravity.CENTER);
            editValue.setTag("value:" + spec.id);
            body.addView(editValue);
            editSlider = new SeekBar(getContext());
            editSlider.setTag("slider:" + spec.id);
            editSlider.setContentDescription(spec.label + " value, 0 to " + spec.max);
            editSlider.setMax(spec.max * 100);
            editSlider.setProgress(Math.round(value(spec) * 100));
            editSlider.setProgressTintList(ColorStateList.valueOf(AMBER));
            editSlider.setThumbTintList(ColorStateList.valueOf(AMBER));
            body.addView(editSlider, new LinearLayout.LayoutParams(-1, dp(56)));
            editSlider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar bar, int progress, boolean user) {
                    if (user) change(spec, progress / 100f);
                }
                @Override public void onStartTrackingTouch(SeekBar bar) { editingTouch = true; }
                @Override public void onStopTrackingTouch(SeekBar bar) { editingTouch = false; }
            });
            LinearLayout steps = row();
            Button minus = action("−1", "decrease:" + spec.id, () -> stepEditor(spec, -1));
            Button plus = action("+1", "increase:" + spec.id, () -> stepEditor(spec, 1));
            minus.setContentDescription("Decrease " + spec.label + " by one");
            plus.setContentDescription("Increase " + spec.label + " by one");
            addWeighted(steps, minus); addWeighted(steps, plus); body.addView(steps);
            TextView hint = text("Drag the slider for a precise value. Changes are heard immediately.", 11, DIM);
            hint.setPadding(0, dp(8), 0, 0); body.addView(hint);
            editor = new AlertDialog.Builder(getContext()).setTitle(spec.label).setView(body)
                    .setPositiveButton("DONE", null).create();
        }
        editor.setOnDismissListener(dialog -> {
            if (editor == dialog) {
                editor = null; editing = null; editSlider = null; editValue = null; editingTouch = false;
            }
        });
        editor.show();
        if (editor.getWindow() != null) editor.getWindow().setBackgroundDrawable(new ColorDrawable(PANEL));
        for (int which : new int[]{AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE}) {
            Button button = editor.getButton(which);
            if (button != null) button.setTextColor(AMBER);
        }
    }

    private void stepEditor(LiraControls.Spec spec, float delta) {
        change(spec, value(spec) + delta);
        if (editSlider != null) editSlider.setProgress(Math.round(value(spec) * 100));
    }

    private final class ParameterButton extends Button {
        final LiraControls.Spec spec;
        final String shortLabel;
        ParameterButton(LiraControls.Spec spec) {
            super(LiraPanelView.this.getContext());
            this.spec = spec;
            shortLabel = shortLabel(spec.id, spec.label);
            styleButton(this, 10, 44);
            setTag("param:" + spec.id);
            setOnClickListener(view -> {
                if (spec.choices != null) change(spec, (Math.round(value(spec)) + 1) % spec.choices.length);
                else openEditor(spec);
            });
            setOnLongClickListener(view -> { openEditor(spec); return true; });
            setTooltipText(spec.label + (spec.choices == null ? ": tap for precise adjustment" : ": tap to cycle, hold to choose"));
        }
        void showValue() {
            float current = value(spec);
            String display = spec.choices == null ? format(current)
                    : spec.choices[Math.min(spec.choices.length - 1, Math.max(0, Math.round(current)))];
            setTextIfChanged(this, shortLabel + "\n" + display);
            setDescriptionIfChanged(this, spec.label + ", " + display + (spec.choices == null ? "; adjust parameter" : "; switch setting"));
        }
    }

    private final class VoicePad extends Button {
        private final int voice;
        private final SparseBooleanArray pointers = new SparseBooleanArray();
        private int pulses;
        private long generation;
        private boolean sounding, remoteHeld;
        VoicePad(Context context, int voice) {
            super(context);
            this.voice = voice;
            styleButton(this, 14, 44);
            setText(Integer.toString(voice));
            setTag("voice:" + voice);
            setContentDescription("Voice " + voice + ": hold to sound, release to stop");
        }
        void setRemoteHeld(boolean held) { remoteHeld = held; updateHeld(); }
        private void updateHeld() {
            boolean next = pointers.size() > 0 || pulses > 0;
            if (next != sounding) {
                sounding = next;
                if (listener != null) listener.onVoice(voice, next);
            }
            setSelected(sounding || remoteHeld);
        }
        void release() { generation++; pointers.clear(); pulses = 0; updateHeld(); }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (!isEnabled()) { release(); return false; }
            int action = event.getActionMasked(), index = event.getActionIndex();
            int id = event.getPointerId(index);
            if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) {
                if (inside(event.getX(index), event.getY(index))) pointers.put(id, true);
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
            } else if (action == MotionEvent.ACTION_MOVE) {
                for (int i = 0; i < event.getPointerCount(); i++)
                    if (!inside(event.getX(i), event.getY(i))) pointers.delete(event.getPointerId(i));
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP) {
                pointers.delete(id);
                if (action == MotionEvent.ACTION_UP) super.performClick();
            } else if (action == MotionEvent.ACTION_CANCEL) { release(); return true; }
            updateHeld(); return true;
        }
        private boolean inside(float x, float y) { return x >= 0 && y >= 0 && x < getWidth() && y < getHeight(); }
        @Override public boolean performClick() {
            super.performClick();
            if (!isEnabled()) return false;
            final long token = generation;
            pulses++; updateHeld();
            postDelayed(() -> { if (generation == token && pulses > 0) { pulses--; updateHeld(); } }, 180);
            return true;
        }
        @Override public void setEnabled(boolean enabled) {
            if (!enabled && pointers != null) release();
            super.setEnabled(enabled);
        }
    }

    private void releaseVoices() { for (VoicePad pad : pads) if (pad != null) pad.release(); }
    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        if (width != oldWidth || height != oldHeight) releaseVoices();
        super.onSizeChanged(width, height, oldWidth, oldHeight);
    }
    @Override public void onWindowFocusChanged(boolean focused) {
        if (!focused) releaseVoices();
        super.onWindowFocusChanged(focused);
    }
    @Override protected void onDetachedFromWindow() {
        releaseVoices();
        if (editor != null) editor.dismiss();
        if (statusDialog != null) statusDialog.dismiss();
        super.onDetachedFromWindow();
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(getContext()); layout.setOrientation(LinearLayout.VERTICAL);
        layout.setMotionEventSplittingEnabled(true); return layout;
    }
    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(getContext()); layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setMotionEventSplittingEnabled(true); return layout;
    }
    private TextView text(String value, float size, int color) {
        TextView view = new TextView(getContext()); view.setText(value); view.setTextSize(size);
        view.setTypeface(Typeface.MONOSPACE); view.setTextColor(color); view.setIncludeFontPadding(false); return view;
    }
    private LinearLayout group(String title) {
        LinearLayout group = column();
        group.setBackground(box(PANEL, DIM));
        group.setPadding(dp(2), dp(2), dp(2), dp(2));
        TextView heading = text(title, 9, AMBER);
        heading.setGravity(Gravity.CENTER);
        heading.setPadding(0, dp(1), 0, dp(3));
        group.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        return group;
    }
    private void parameterGrid(LinearLayout parent, int columns, String... ids) {
        for (int start = 0; start < ids.length; start += columns) {
            LinearLayout row = row();
            for (int index = start; index < Math.min(start + columns, ids.length); index++) addWeighted(row, parameter(ids[index]));
            parent.addView(row, new LinearLayout.LayoutParams(-1, -2));
        }
    }
    private ParameterButton parameter(String id) {
        LiraControls.Spec spec = LiraControls.find(id);
        if (spec == null || parameterButtons.containsKey(id)) throw new IllegalStateException("Invalid/repeated LIRA control " + id);
        ParameterButton button = new ParameterButton(spec); parameterButtons.put(id, button); return button;
    }
    private void addWeighted(LinearLayout row, View view) { addWeighted(row, view, 1f); }
    private void addWeighted(LinearLayout row, View view, float weight) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, weight);
        params.setMargins(dp(1), dp(1), dp(1), dp(1)); row.addView(view, params);
    }
    private void addSection(LinearLayout panel, View section, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(margin); panel.addView(section, params);
    }
    private Button action(String label, String tag, Runnable action) {
        Button button = new Button(getContext()); styleButton(button, 10, 44);
        button.setText(label); button.setTag(tag); button.setOnClickListener(view -> action.run()); return button;
    }
    private void styleButton(Button button, float size, int height) {
        button.setAllCaps(false); button.setTypeface(Typeface.MONOSPACE); button.setTextSize(size);
        button.setGravity(Gravity.CENTER); button.setIncludeFontPadding(false);
        button.setMinWidth(0); button.setMinimumWidth(0);
        button.setMinHeight(dp(height)); button.setMinimumHeight(dp(height));
        button.setPadding(dp(2), dp(2), dp(2), dp(2));
        button.setTextColor(new ColorStateList(new int[][]{{-android.R.attr.state_enabled}, {android.R.attr.state_selected}, {android.R.attr.state_pressed}, {}},
                new int[]{DIM, BLACK, BLACK, AMBER}));
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{-android.R.attr.state_enabled}, box(BLACK, DIM));
        states.addState(new int[]{android.R.attr.state_selected}, box(AMBER, AMBER));
        states.addState(new int[]{android.R.attr.state_pressed}, box(AMBER, AMBER));
        states.addState(new int[]{}, box(BLACK, DIM));
        button.setBackground(states);
    }
    private GradientDrawable box(int fill, int stroke) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(fill); drawable.setStroke(dp(1), stroke); return drawable;
    }
    private static String shortLabel(String id, String fallback) {
        if (id.startsWith("hold-")) return "HOLD";
        if (id.startsWith("pitch-")) return "PITCH";
        if (id.startsWith("source-")) return "SOURCE";
        if (id.startsWith("sharp-")) return "SHARP";
        if (id.startsWith("fast-")) return "RATE";
        if (id.matches("mod-(12|34|56|78)")) return "MOD";
        if (id.equals("dst-mix")) return "MIX";
        if (id.equals("del-mix")) return "MIX";
        if (id.equals("andor")) return "LOGIC";
        if (id.equals("del-mod")) return "MOD SRC";
        if (id.equals("lfo-wav")) return "WAVE";
        return fallback;
    }

    private final class MiniScope extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final float[] samples = new float[512];
        private int count;
        private boolean live;
        MiniScope(Context context) { super(context); paint.setTypeface(Typeface.MONOSPACE); }
        void update(float[] input, boolean running) {
            live = running; count = input == null ? 0 : Math.min(samples.length, input.length);
            for (int i = 0; i < count; i++) {
                float value = input[i * input.length / count];
                samples[i] = Float.isFinite(value) ? Math.max(-1f, Math.min(1f, value)) : 0f;
            }
            invalidate();
        }
        @Override protected void onDraw(Canvas canvas) {
            canvas.drawColor(BLACK);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(1)); paint.setColor(GRID);
            for (int i = 1; i < 8; i++) canvas.drawLine(getWidth() * i / 8f, 0, getWidth() * i / 8f, getHeight(), paint);
            canvas.drawLine(0, getHeight() / 2f, getWidth(), getHeight() / 2f, paint);
            paint.setColor(DIM); canvas.drawRect(0, 0, getWidth() - 1, getHeight() - 1, paint);
            float peak = 0;
            for (int i = 0; i < count; i++) peak = Math.max(peak, Math.abs(samples[i]));
            float gain = live && peak > 0.0001f ? Math.max(1f, Math.min(16f, 0.8f / peak)) : 1f;
            path.reset();
            if (!live || count < 2) { path.moveTo(0, getHeight() / 2f); path.lineTo(getWidth(), getHeight() / 2f); }
            else for (int i = 0; i < count; i++) {
                float x = getWidth() * i / (count - 1f), y = getHeight() / 2f - samples[i] * gain * getHeight() * 0.44f;
                if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
            }
            paint.setColor(AMBER); paint.setStrokeWidth(dp(1)); canvas.drawPath(path, paint);
            paint.setStyle(Paint.Style.FILL); paint.setTextSize(dp(8)); paint.setColor(DIM);
            canvas.drawText("OUTPUT · DISPLAY " + Math.round(gain) + "X", dp(4), dp(10), paint);
        }
    }
}
