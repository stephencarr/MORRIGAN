package org.morrigan.mobile.midi;

import android.content.Context;
import android.content.pm.PackageManager;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** USB MIDI 1 input through Android's MIDI service. No raw USB/network access. */
public final class UsbMidiController implements AutoCloseable {
    public interface Sink extends LiraMidiMapper.Sink {
        void onStatus(String status);
    }

    private final Context context;
    private final Sink sink;
    private final LiraMidiMapper mapper;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<Integer, Connection> connections = new HashMap<>();
    private MidiManager manager;
    private boolean started;
    private boolean registered;
    private long generation;
    private MidiManager.DeviceCallback callback;

    private static final class Port {
        final String source;
        final MidiOutputPort port;
        final MidiReceiver receiver;
        Port(String source, MidiOutputPort port, MidiReceiver receiver) {
            this.source = source;
            this.port = port;
            this.receiver = receiver;
        }
    }

    private static final class Connection {
        final MidiDeviceInfo info;
        final List<Port> ports = new ArrayList<>();
        MidiDevice device;
        boolean active = true;
        Connection(MidiDeviceInfo info) { this.info = info; }
    }

    public UsbMidiController(Context context, Sink sink) {
        if (context == null || sink == null) throw new IllegalArgumentException("Context and sink required");
        this.context = context.getApplicationContext();
        this.sink = sink;
        this.mapper = new LiraMidiMapper(sink);
    }

    public synchronized void start() {
        if (started) return;
        if (!context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_MIDI)) {
            sink.onStatus("ANDROID MIDI UNAVAILABLE");
            return;
        }
        manager = context.getSystemService(MidiManager.class);
        if (manager == null) {
            sink.onStatus("ANDROID MIDI UNAVAILABLE");
            return;
        }
        started = true;
        final long current = ++generation;
        callback = new MidiManager.DeviceCallback() {
            @Override public void onDeviceAdded(MidiDeviceInfo info) {
                synchronized (UsbMidiController.this) {
                    if (started && generation == current) attach(info);
                }
            }
            @Override public void onDeviceRemoved(MidiDeviceInfo info) {
                synchronized (UsbMidiController.this) {
                    if (started && generation == current) detach(info.getId());
                }
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                manager.registerDeviceCallback(MidiManager.TRANSPORT_MIDI_BYTE_STREAM,
                        command -> handler.post(command), callback);
            } else manager.registerDeviceCallback(callback, handler);
            registered = true;
            sink.onStatus("USB MIDI · CONNECT A CONTROLLER");
            if (Build.VERSION.SDK_INT >= 33) {
                for (MidiDeviceInfo info : manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM)) attach(info);
            } else {
                for (MidiDeviceInfo info : manager.getDevices()) attach(info);
            }
        } catch (RuntimeException exception) {
            close();
            sink.onStatus("MIDI START FAILED · " + exception.getClass().getSimpleName());
        }
    }

    private synchronized void attach(MidiDeviceInfo info) {
        if (!started || info.getType() != MidiDeviceInfo.TYPE_USB
                || info.getOutputPortCount() == 0 || connections.containsKey(info.getId())) return;
        Connection connection = new Connection(info);
        connections.put(info.getId(), connection);
        sink.onStatus("USB MIDI · CONNECTING " + name(info));
        try {
            manager.openDevice(info, device -> opened(connection, device), handler);
        } catch (RuntimeException exception) {
            connections.remove(info.getId());
            dispose(connection);
            sink.onStatus("USB MIDI OPEN FAILED · " + name(info));
        }
    }

    private synchronized void opened(Connection connection, MidiDevice device) {
        // An async callback can arrive after removal, stop, or a subsequent start.
        if (!started || !connection.active || connections.get(connection.info.getId()) != connection) {
            closeDevice(device);
            return;
        }
        if (device == null) {
            connections.remove(connection.info.getId());
            connection.active = false;
            sink.onStatus("USB MIDI OPEN FAILED · " + name(connection.info));
            return;
        }
        connection.device = device;
        try {
            for (MidiDeviceInfo.PortInfo info : connection.info.getPorts()) {
                if (info.getType() != MidiDeviceInfo.PortInfo.TYPE_OUTPUT) continue;
                MidiOutputPort port = device.openOutputPort(info.getPortNumber());
                if (port == null) continue;
                final String source = connection.info.getId() + ":" + info.getPortNumber();
                final MidiStreamParser parser = new MidiStreamParser(new MidiStreamParser.Listener() {
                    @Override public void onMessage(int status, int data1, int data2) {
                        mapper.receive(source, status, data1, data2);
                    }
                    @Override public void onSystemReset() { mapper.panic(); }
                });
                MidiReceiver receiver = new MidiReceiver() {
                    @Override public void onSend(byte[] data, int offset, int count, long timestamp) {
                        synchronized (UsbMidiController.this) {
                            if (started && connection.active) parser.accept(data, offset, count);
                        }
                    }
                    @Override public void onFlush() {
                        synchronized (UsbMidiController.this) {
                            parser.reset();
                            if (started && connection.active) mapper.disconnect(source);
                        }
                    }
                };
                // Register the resource before connect so failed setup can close it.
                connection.ports.add(new Port(source, port, receiver));
                port.connect(receiver);
            }
            if (connection.ports.isEmpty()) {
                connections.remove(connection.info.getId());
                dispose(connection);
                sink.onStatus("USB MIDI · NO INPUT PORT AVAILABLE");
            } else reportConnected();
        } catch (RuntimeException exception) {
            connections.remove(connection.info.getId());
            dispose(connection);
            sink.onStatus("USB MIDI PORT FAILED · " + name(connection.info));
        }
    }

    private synchronized void detach(int id) {
        Connection connection = connections.remove(id);
        if (connection != null) dispose(connection);
        if (started) reportConnected();
    }

    public synchronized void setProfile(String profile) {
        mapper.setProfile(profile);
        if (started) reportConnected();
    }

    public synchronized String profile() { return mapper.profile(); }

    public synchronized void panic() { mapper.panic(); }

    @Override public synchronized void close() {
        started = false;
        generation++;
        if (registered && manager != null) {
            try { manager.unregisterDeviceCallback(callback); } catch (RuntimeException ignored) { }
        }
        registered = false;
        for (Connection connection : new ArrayList<>(connections.values())) dispose(connection);
        connections.clear();
        mapper.releaseAll();
        sink.onStatus("USB MIDI STOPPED");
    }

    private void dispose(Connection connection) {
        connection.active = false;
        for (Port item : connection.ports) {
            mapper.disconnect(item.source);
            item.port.disconnect(item.receiver);
            try { item.port.close(); } catch (IOException ignored) { }
        }
        connection.ports.clear();
        closeDevice(connection.device);
        connection.device = null;
    }

    private static void closeDevice(MidiDevice device) {
        if (device != null) try { device.close(); } catch (IOException ignored) { }
    }

    private void reportConnected() {
        int count = 0;
        String lastName = "";
        for (Connection connection : connections.values()) {
            if (!connection.ports.isEmpty()) {
                count++;
                lastName = name(connection.info);
            }
        }
        if (count == 0) sink.onStatus("USB MIDI · CONNECT A CONTROLLER");
        else sink.onStatus("USB MIDI · " + count + " DEVICE" + (count == 1 ? " · " + lastName : "S")
                + " · " + mapper.profile().toUpperCase(java.util.Locale.ROOT));
    }

    private static String name(MidiDeviceInfo info) {
        String name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME);
        return name == null || name.isEmpty() ? "DEVICE " + info.getId() : name;
    }
}
