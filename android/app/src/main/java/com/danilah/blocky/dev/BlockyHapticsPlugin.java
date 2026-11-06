package com.danilah.blocky.dev;
import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BlockyHaptics")
public class BlockyHapticsPlugin extends Plugin {
  private Vibrator vibrator;
  private boolean active, resumed = true;
  private final HapticPattern.Gate gate = new HapticPattern.Gate();
  @Override public void load() { vibrator = (Vibrator)getContext().getSystemService(Context.VIBRATOR_SERVICE); }
  @PluginMethod public void setActive(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      active = Boolean.TRUE.equals(call.getBoolean("active"));
      if (!active && vibrator != null) { vibrator.cancel(); gate.reset(); }
      call.resolve();
    });
  }
  @PluginMethod public void pulse(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      if (active && resumed && vibrator != null && vibrator.hasVibrator()) {
        String kind = call.getString("kind", "place");
        int level = Math.max(1, Math.min(8, call.getInt("level", 1)));
        HapticPattern pattern = HapticPattern.forEvent(kind, level);
        if (!gate.accept(android.os.SystemClock.elapsedRealtime(), pattern)) { call.resolve(); return; }
        long[] times = pattern.times;
        int[] amps = pattern.amplitudes;
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(vibrator.hasAmplitudeControl() ? VibrationEffect.createWaveform(times, amps, -1) : VibrationEffect.createWaveform(times, -1));
        else vibrator.vibrate(times, -1);
      }
      call.resolve();
    });
  }
  @Override protected void handleOnPause() { resumed = false; gate.reset(); if (vibrator != null) vibrator.cancel(); }
  @Override protected void handleOnResume() { resumed = true; }
  @Override protected void handleOnDestroy() { active = false; gate.reset(); if (vibrator != null) vibrator.cancel(); }
}
