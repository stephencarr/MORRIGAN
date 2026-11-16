package org.morrigan.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.IBinder;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.morrigan.mobile.midi.LiraMidiMapper;
import org.morrigan.mobile.midi.MidiStreamParser;

/** Dependency-free on-device smoke suite; USB electrical transport is not simulated. */
public final class SmokeInstrumentation extends Instrumentation {
    private InstrumentService service;
    private final JSONArray passed = new JSONArray();
    private final CountDownLatch connected = new CountDownLatch(1);
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((InstrumentService.LocalBinder) binder).service(); connected.countDown();
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; }
    };

    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    private void expect(BooleanSupplier condition, String name) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 15000;
        while (!condition.getAsBoolean() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(20);
        if (!condition.getAsBoolean()) throw new AssertionError(name + ": " + (service == null ? "no service" : service.status()));
        passed.put(name);
    }

    private static double rms(float[] samples) {
        double sum = 0;
        for (float sample : samples) {
            if (!Float.isFinite(sample)) throw new AssertionError("Nonfinite scope audio");
            sum += sample * sample;
        }
        return Math.sqrt(sum / Math.max(1, samples.length));
    }

    private void startAudio(Context context) {
        context.startForegroundService(new Intent(context, InstrumentService.class).setAction(InstrumentService.ACTION_START));
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        Context context = getTargetContext();
        Activity activity = null;
        boolean bound = false;
        try {
            activity = startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            bound = context.bindService(new Intent(context, InstrumentService.class), connection, Context.BIND_AUTO_CREATE);
            if (!connected.await(10, TimeUnit.SECONDS)) throw new AssertionError("Service bind timed out");
            startAudio(context);
            expect(() -> service.running(), "Foreground service starts native LIRA and AudioTrack");
            expect(() -> rms(service.scopeSnapshot()) < 0.0001, "Startup is silent");
            for (int voice = 1; voice <= 8; voice++) {
                service.setTouch(voice, true);
                expect(() -> rms(service.scopeSnapshot()) > 0.005, "Touch voice " + voice + " produces real PCM");
                service.setTouch(voice, false);
                expect(() -> rms(service.scopeSnapshot()) < 0.0001, "Touch voice " + voice + " releases");
            }
            LiraMidiMapper mapper = new LiraMidiMapper(service);
            MidiStreamParser parser = new MidiStreamParser(new MidiStreamParser.Listener() {
                @Override public void onMessage(int status, int one, int two) { mapper.receive("instrumentation", status, one, two); }
                @Override public void onSystemReset() { mapper.panic(); }
            });
            byte[] note = {(byte) 0x90, 36, 100};
            parser.accept(note, 0, note.length);
            expect(() -> rms(service.scopeSnapshot()) > 0.005, "MIDI byte parser maps note to native audio");
            service.setTouch(1, true);
            parser.accept(new byte[]{(byte)0x80, 36, 0}, 0, 3);
            SystemClock.sleep(100);
            expect(() -> rms(service.scopeSnapshot()) > 0.005, "MIDI release preserves an independent touch hold");
            service.setTouch(1, false);
            expect(() -> rms(service.scopeSnapshot()) < 0.0001, "Final owner release silences the voice");
            parser.accept(note, 0, note.length);
            expect(() -> rms(service.scopeSnapshot()) > 0.005, "MIDI voice restarts");
            Activity visible = activity;
            runOnMainSync(() -> visible.moveTaskToBack(true));
            SystemClock.sleep(300);
            expect(() -> service.running() && rms(service.scopeSnapshot()) > 0.005, "Foreground MIDI audio continues with Activity backgrounded");
            service.onPanic();
            expect(() -> rms(service.scopeSnapshot()) < 0.0001, "Panic releases native sensors");
            // Return to a visible Activity before an intentional focus-change test.
            Activity restored = startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            AudioFocusRequest interruption = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(AudioEngine.ATTRIBUTES).setOnAudioFocusChangeListener(change -> {}).build();
            int focus = manager.requestAudioFocus(interruption);
            if (focus != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw new AssertionError("Test audio focus denied");
            expect(() -> !service.active(), "Audio-focus loss stops the instrument");
            manager.abandonAudioFocusRequest(interruption);
            SystemClock.sleep(100);
            expect(() -> !service.active(), "Focus return does not autoplay");
            for (int restart = 0; restart < 3; restart++) {
                startAudio(context);
                expect(() -> service.running(), "Native restart " + restart);
                service.setTouch(1, true);
                expect(() -> rms(service.scopeSnapshot()) > 0.005, "Restart " + restart + " sounds");
                runOnMainSync(service::stopAudio);
                expect(() -> !service.active(), "Restart " + restart + " stops cleanly");
            }
            // Stress cancellation before native initialization has settled.
            for (int cancel = 0; cancel < 3; cancel++) {
                startAudio(context);
                expect(() -> service.active(), "Startup request " + cancel + " accepted");
                runOnMainSync(service::stopAudio);
                expect(() -> !service.active(), "Startup cancellation " + cancel);
            }
            runOnMainSync(restored::finish);
            result.putString("stream", "PASS " + passed.length() + " Android smoke assertions\n" + passed);
            result.putString("result", "PASS");
        } catch (Throwable error) {
            android.util.Log.e("MorriganSmoke", "Smoke test failed", error);
            result.putString("stream", "FAIL: " + error + "\nPassed: " + passed);
            result.putString("result", "FAIL");
        } finally {
            if (service != null) runOnMainSync(service::stopAudio);
            if (bound) context.unbindService(connection);
            if (activity != null) { Activity closing = activity; runOnMainSync(closing::finish); }
            try (FileOutputStream file = context.openFileOutput("smoke-result.json", Context.MODE_PRIVATE)) {
                JSONObject report = new JSONObject().put("result", result.getString("result"))
                        .put("assertions", passed).put("details", result.getString("stream"))
                        .put("physicalUsbTested", false).put("physicalPixelTested", false);
                file.write(report.toString(2).getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) { }
            finish("PASS".equals(result.getString("result")) ? Activity.RESULT_OK : Activity.RESULT_CANCELED, result);
        }
    }
}
