package com.danilah.blocky.dev;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** All state and AudioManager calls belong to the main thread. No background audio. */
@CapacitorPlugin(name = "BlockyAudioFocus")
public class BlockyAudioFocusPlugin extends Plugin {
  private AudioManager manager;
  private AudioFocusRequest request;
  private AudioManager.OnAudioFocusChangeListener listener;
  private boolean active, resumed = true, attempted, allowed, destroyed;
  private long revision, generation;

  @Override public void load() {
    manager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
  }
  private JSObject state() {
    JSObject value = new JSObject();
    value.put("allowed", allowed && active && resumed && !destroyed);
    value.put("revision", ++revision);
    return value;
  }
  private void publish() { notifyListeners("focusChanged", state()); }
  private void release() {
    generation++;
    allowed = false;
    attempted = false;
    if (manager != null && listener != null) {
      if (Build.VERSION.SDK_INT >= 26 && request != null) manager.abandonAudioFocusRequest(request);
      else manager.abandonAudioFocus(listener);
    }
    request = null;
    listener = null;
    publish();
  }
  @PluginMethod public void setActive(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      boolean next = Boolean.TRUE.equals(call.getBoolean("active"));
      if (!next) release();
      active = next;
      call.resolve(state());
    });
  }
  @PluginMethod public void request(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      if (!destroyed && active && resumed && !attempted && manager != null) {
        attempted = true;
        final long token = ++generation;
        listener = change -> {
          if (destroyed || token != generation || !active || !resumed) return;
          allowed = change == AudioManager.AUDIOFOCUS_GAIN;
          // Permanent loss is not retried by every tap. Pause/resume or mute toggling
          // opens a new session; transient loss can regain focus through this listener.
          publish();
        };
        int result;
        if (Build.VERSION.SDK_INT >= 26) {
          request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_GAME)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setWillPauseWhenDucked(true)
            .setAcceptsDelayedFocusGain(true)
            .setOnAudioFocusChangeListener(listener, new Handler(Looper.getMainLooper())).build();
          result = manager.requestAudioFocus(request);
        } else {
          result = manager.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        allowed = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
      }
      call.resolve(state());
    });
  }
  @Override protected void handleOnPause() { resumed = false; release(); }
  @Override protected void handleOnResume() { resumed = true; /* next explicit gesture requests focus */ }
  @Override protected void handleOnDestroy() { destroyed = true; release(); }
}
