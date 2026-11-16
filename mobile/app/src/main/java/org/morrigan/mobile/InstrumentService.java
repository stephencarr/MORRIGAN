package org.morrigan.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import org.morrigan.mobile.midi.UsbMidiController;

/** User-started foreground playback; no boot receiver, network or microphone access. */
public final class InstrumentService extends Service implements UsbMidiController.Sink {
    public static final String ACTION_START = "org.morrigan.mobile.START";
    public static final String ACTION_STOP = "org.morrigan.mobile.STOP";
    private static final String CHANNEL = "instrument-playback";
    private static final int NOTIFICATION = 8;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LocalBinder binder = new LocalBinder();
    private final boolean[] touch = new boolean[8];
    private final boolean[] midiGates = new boolean[8];
    private AudioEngine engine;
    private UsbMidiController midi;
    private AudioManager audioManager;
    private AudioFocusRequest focus;
    private PowerManager.WakeLock wakeLock;
    private SharedPreferences preferences;
    private volatile String midiStatus = "USB MIDI: CONNECT A DEVICE";
    private volatile String serviceStatus;
    private volatile float volume = 0.5f;
    private volatile String currentProfile = "notes";
    private boolean foreground;
    private boolean destroyed;

    public final class LocalBinder extends Binder { public InstrumentService service() { return InstrumentService.this; } }

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { stopAudio(); }
    };

    @Override public void onCreate() {
        super.onCreate();
        preferences = getSharedPreferences("instrument", MODE_PRIVATE);
        volume = Math.max(0, Math.min(1, preferences.getFloat("volume", 0.5f)));
        currentProfile = preferences.getString("profile", "notes");
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(AudioEngine.ATTRIBUTES)
                .setOnAudioFocusChangeListener(change -> {
                    if (change != AudioManager.AUDIOFOCUS_GAIN) stopAudio();
                }, main).build();
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "morrigan:audio");
        wakeLock.setReferenceCounted(false);
        NotificationManager notifications = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "Instrument audio", NotificationManager.IMPORTANCE_LOW));
        engine = new AudioEngine(this, reason -> main.post(() -> {
            if (destroyed) return;
            if (engine.active()) return;
            if (reason.startsWith("AUDIO ERROR")) serviceStatus = reason;
            finishPlayback();
        }));
        midi = new UsbMidiController(this, this);
        midi.setProfile(currentProfile);
        midi.start();
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, filter, RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, filter);
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_START.equals(intent.getAction())) startAudio();
        else if (intent != null && ACTION_STOP.equals(intent.getAction())) stopAudio();
        return START_NOT_STICKY; // Never resume audible output after a process restart.
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, InstrumentService.class).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("MORRIGAN Mobile")
                .setContentText("LIRA instrument · USB MIDI active").setContentIntent(open)
                .setCategory(Notification.CATEGORY_TRANSPORT).setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Stop", stop).build()).build();
    }

    private void startAudio() {
        if (engine.active()) return;
        serviceStatus = null;
        // API 35 permits focus requests from a visible Activity or existing FGS.
        startForeground(NOTIFICATION, notification());
        foreground = true;
        if (audioManager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            serviceStatus = "AUDIO FOCUS UNAVAILABLE · TAP START TO RETRY";
            finishPlayback();
            return;
        }
        clearGates();
        midi.panic();
        wakeLock.acquire();
        engine.start(volume);
    }

    public void stopAudio() {
        clearGates();
        if (midi != null) midi.panic();
        if (engine != null) engine.stop();
        if (engine == null || !engine.active()) finishPlayback();
    }

    private void finishPlayback() {
        preferences.edit().putFloat("volume", volume).putString("profile", currentProfile).apply();
        if (wakeLock.isHeld()) wakeLock.release();
        audioManager.abandonAudioFocusRequest(focus);
        if (foreground) { stopForeground(STOP_FOREGROUND_REMOVE); foreground = false; }
        stopSelf();
    }

    private synchronized void clearGates() {
        for (int i = 0; i < 8; i++) { touch[i] = false; midiGates[i] = false; }
    }

    public synchronized void setTouch(int voice, boolean down) {
        if (voice < 1 || voice > 8) return;
        touch[voice - 1] = down && engine.running();
        engine.control("sensor-" + voice, touch[voice - 1] || midiGates[voice - 1] ? 1 : 0);
    }

    public void releaseTouches() { for (int i = 1; i <= 8; i++) setTouch(i, false); }

    @Override public synchronized void onControl(String name, float value) {
        if (name.startsWith("sensor-") && name.length() == 8) {
            int index = name.charAt(7) - '1';
            if (index < 0 || index >= 8) return;
            midiGates[index] = value > 0 && engine.running();
            engine.control(name, touch[index] || midiGates[index] ? 1 : 0);
        } else {
            if ("vol".equals(name)) volume = Math.max(0, Math.min(1, value / 127));
            engine.control(name, value);
        }
    }

    @Override public void onStatus(String status) { midiStatus = status; }

    @Override public synchronized void onPanic() {
        clearGates();
        if (engine == null) return;
        for (int i = 1; i <= 8; i++) engine.control("sensor-" + i, 0);
        engine.control("hold-1234", 0);
        engine.control("hold-5678", 0);
    }

    public void setVolume(float normalized) {
        if (!Float.isFinite(normalized)) return;
        volume = Math.max(0, Math.min(1, normalized));
        engine.control("vol", volume * 127);
    }

    public void toggleProfile() {
        currentProfile = "lcxl".equals(currentProfile) ? "notes" : "lcxl";
        midi.setProfile(currentProfile);
        preferences.edit().putString("profile", currentProfile).apply();
    }

    public boolean running() { return engine.running(); }
    public boolean active() { return engine.active(); }
    public String status() { return serviceStatus == null ? engine.status() : serviceStatus; }
    public String midiStatus() { return midiStatus; }
    public float[] scopeSnapshot() { return engine.snapshot(); }
    public float volume() { return volume; }
    public String profile() { return currentProfile; }
    public int underruns() { return engine.underruns(); }

    @Override public void onDestroy() {
        destroyed = true;
        main.removeCallbacksAndMessages(null);
        unregisterReceiver(noisy);
        if (midi != null) midi.close();
        if (engine != null) { engine.stop(); engine.awaitStopped(); }
        if (wakeLock.isHeld()) wakeLock.release();
        audioManager.abandonAudioFocusRequest(focus);
        preferences.edit().putFloat("volume", volume).putString("profile", currentProfile).apply();
        super.onDestroy();
    }
}
