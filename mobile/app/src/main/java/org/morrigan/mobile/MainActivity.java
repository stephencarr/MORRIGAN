package org.morrigan.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.Toast;

public final class MainActivity extends Activity implements ScopeView.Listener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private ScopeView scope;
    private InstrumentService service;
    private boolean bound;
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((InstrumentService.LocalBinder) binder).service();
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; }
    };
    private final Runnable render = new Runnable() {
        @Override public void run() {
            if (service != null) scope.update(service.scopeSnapshot(), service.status() + " · XRUN " + service.underruns(),
                    service.midiStatus(), service.running(), service.profile(), service.volume());
            main.postDelayed(this, 33);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        scope = new ScopeView(this);
        scope.setListener(this);
        root.addView(scope, new FrameLayout.LayoutParams(-1, -1));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        root.requestApplyInsets();
        root.post(this::hideSystemBars);
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30 && getWindow().getInsetsController() != null) {
            getWindow().getInsetsController().setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            getWindow().getInsetsController().hide(WindowInsets.Type.systemBars());
        } else getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) hideSystemBars();
    }

    @Override protected void onStart() {
        super.onStart();
        bound = bindService(new Intent(this, InstrumentService.class), connection, Context.BIND_AUTO_CREATE);
        main.post(render);
    }

    @Override protected void onStop() {
        main.removeCallbacks(render);
        if (service != null) service.releaseTouches();
        if (bound) { unbindService(connection); bound = false; }
        service = null;
        super.onStop();
    }

    @Override public void onStartStop() {
        if (service == null) return;
        if (service.active()) service.stopAudio();
        else {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
            }
            startForegroundService(new Intent(this, InstrumentService.class).setAction(InstrumentService.ACTION_START));
        }
    }

    @Override public void onPanic() { if (service != null) service.stopAudio(); }
    @Override public void onVoice(int voice, boolean down) { if (service != null) service.setTouch(voice, down); }
    @Override public void onVolume(float normalized) { if (service != null) service.setVolume(normalized); }
    @Override public void onProfileToggle() { if (service != null) service.toggleProfile(); }
    @Override public void onPinRequested() {
        try { startLockTask(); }
        catch (RuntimeException error) { Toast.makeText(this, "Enable app pinning in Android Settings, then try again.", Toast.LENGTH_LONG).show(); }
    }
}
