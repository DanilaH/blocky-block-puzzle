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
  private long protectedUntil;
  private int priority;
  @Override public void load() { vibrator = (Vibrator)getContext().getSystemService(Context.VIBRATOR_SERVICE); }
  @PluginMethod public void setActive(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      active = Boolean.TRUE.equals(call.getBoolean("active"));
      if (!active && vibrator != null) { vibrator.cancel(); protectedUntil = 0; }
      call.resolve();
    });
  }
  @PluginMethod public void pulse(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      if (active && resumed && vibrator != null && vibrator.hasVibrator()) {
        String kind = call.getString("kind", "place");
        int level = Math.max(1, Math.min(5, call.getInt("level", 1)));
        int nextPriority = kind.equals("empty") ? 3 : kind.equals("record") ? 2 : kind.equals("clear") ? 1 : 0;
        long now = android.os.SystemClock.elapsedRealtime();
        if (now < protectedUntil && nextPriority < priority) { call.resolve(); return; }
        long[] times; int[] amps;
        switch (kind) {
          case "empty": times = new long[]{0,35,65,45,80,110}; amps = new int[]{0,180,0,220,0,255}; break;
          case "defeat": times = new long[]{0,30,100,50}; amps = new int[]{0,130,0,170}; break;
          case "record": times = new long[]{0,25,55,55}; amps = new int[]{0,170,0,230}; break;
          case "clear": times = new long[]{0,25+level*5,45,30+level*8}; amps = new int[]{0,180,0,Math.min(255,180+level*15)}; break;
          default: times = new long[]{0,22}; amps = new int[]{0,155};
        }
        priority = nextPriority;
        long duration = 0; for (long t : times) duration += t;
        protectedUntil = now + duration;
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(vibrator.hasAmplitudeControl() ? VibrationEffect.createWaveform(times, amps, -1) : VibrationEffect.createWaveform(times, -1));
        else vibrator.vibrate(times, -1);
      }
      call.resolve();
    });
  }
  @Override protected void handleOnPause() { resumed = false; protectedUntil = 0; if (vibrator != null) vibrator.cancel(); }
  @Override protected void handleOnResume() { resumed = true; }
  @Override protected void handleOnDestroy() { active = false; if (vibrator != null) vibrator.cancel(); }
}
