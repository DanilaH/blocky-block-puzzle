package com.danilah.blocky.dev;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.TracingConfig;
import android.webkit.TracingController;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Explicit preview-only capture. Nothing starts at load and nothing uploads. */
@CapacitorPlugin(name = "BlockyTrace")
public class BlockyTracePlugin extends Plugin {
  private final Handler ui = new Handler(Looper.getMainLooper());
  private final ExecutorService writer = Executors.newSingleThreadExecutor();
  private final ArrayList<PluginCall> waiting = new ArrayList<>();
  private boolean owned, flushing, ready, destroyed, screenOnOwned;
  private long bytes;
  private String error = "not-started", reason = "";
  private String captureId = "";
  private File trace;
  private final Runnable timeout = () -> stopOwned("timeout");
  private boolean supported() {
    return Build.VERSION.SDK_INT >= 28 &&
      (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }
  private void releaseScreen() {
    if (screenOnOwned) {
      getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      screenOnOwned = false;
    }
  }
  @PluginMethod public void setScreenOn(PluginCall call) { ui.post(() -> {
    if (call.getBoolean("enabled", false)) {
      if (destroyed || (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
        call.reject("Diagnostic screen hold unavailable"); return;
      }
      if ((getActivity().getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) == 0) {
        getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        screenOnOwned = true;
      }
    } else releaseScreen();
    call.resolve();
  }); }
  private JSObject status() {
    JSObject result = new JSObject();
    result.put("supported", supported()); result.put("ready", ready);
    result.put("recording", owned); result.put("flushing", flushing);
    result.put("bytes", bytes); result.put("error", error); result.put("reason", reason);
    result.put("captureId", captureId);
    result.put("categories", "ANDROID_WEBVIEW|JAVASCRIPT_AND_RENDERING|blink.user_timing");
    result.put("mode", "RECORD_UNTIL_FULL"); result.put("maxDurationMs", 25000);
    result.put("maxOutputBytes", 64 * 1024 * 1024);
    return result;
  }
  @PluginMethod public void reset(PluginCall call) { ui.post(() -> {
    if (owned || flushing) { call.reject("Trace still active"); return; }
    ready = false; bytes = 0; captureId = ""; error = "not-started"; reason = "";
    File old = new File(getContext().getCacheDir(), "blocky-webview-trace.json");
    if (old.exists() && !old.delete()) { error = "clear-failed"; call.reject("Cannot clear old trace"); return; }
    trace = null;
    call.resolve(status());
  }); }
  @PluginMethod public void start(PluginCall call) { ui.post(() -> {
    if (!supported()) { error = "unsupported"; call.resolve(status()); return; }
    if (owned || flushing) { call.reject("Trace already active"); return; }
    ready = false; bytes = 0; error = ""; reason = ""; captureId = UUID.randomUUID().toString();
    try {
      TracingController controller = TracingController.getInstance();
      if (controller.isTracing()) { error = "external-trace-active"; call.resolve(status()); return; }
      trace = new File(getContext().getCacheDir(), "blocky-webview-trace.json");
      if (trace.exists() && !trace.delete()) throw new IOException("Cannot clear old trace");
      controller.start(new TracingConfig.Builder()
        .addCategories(TracingConfig.CATEGORIES_ANDROID_WEBVIEW, TracingConfig.CATEGORIES_JAVASCRIPT_AND_RENDERING)
        .addCategories("blink.user_timing")
        .setTracingMode(TracingConfig.RECORD_UNTIL_FULL).build());
      owned = true;
      ui.postDelayed(timeout, 25000);
    } catch (Exception failure) { error = "start-failed"; }
    call.resolve(status());
  }); }
  @PluginMethod public void stop(PluginCall call) { ui.post(() -> {
    if (!owned && !flushing) { call.resolve(status()); return; }
    waiting.add(call);
    stopOwned("requested");
  }); }
  private void finish(String failure) {
    flushing = false; error = failure.isEmpty() && bytes == 0 ? "empty-output" : failure;
    ready = error.isEmpty() && bytes > 0;
    if (!ready && trace != null) trace.delete();
    for (PluginCall call : waiting) call.resolve(status());
    waiting.clear();
    if (destroyed) writer.shutdown();
  }
  private void stopOwned(String why) {
    if (!owned || Build.VERSION.SDK_INT < 28) return;
    owned = false; flushing = true; reason = why; ui.removeCallbacks(timeout);
    try {
      BoundedTraceStream output = new BoundedTraceStream(new FileOutputStream(trace), 64L * 1024 * 1024) {
        @Override public void close() throws IOException {
          String failure = "";
          try { super.close(); } catch (IOException e) { failure = "write-failed"; }
          final String result = truncated() ? "output-limit" : failed() ? "write-failed" : failure;
          final long size = bytes();
          ui.post(() -> { if (flushing) { bytes = size; finish(result); } });
        }
      };
      if (!TracingController.getInstance().stop(output, writer)) {
        output.close();
        finish("trace-not-running");
      }
    } catch (Exception failure) {
      // A failed disk open must still terminate our native recording.
      try { TracingController.getInstance().stop(null, writer); } catch (Exception ignored) {}
      finish("stop-failed");
    }
  }
  @PluginMethod public void share(PluginCall call) { ui.post(() -> {
    String json = call.getString("json", "");
    if (owned || flushing || json.isEmpty() || json.length() > 1000000) {
      call.reject("Diagnostic not ready"); return;
    }
    final boolean includeTrace = call.getBoolean("includeTrace", true) && ready && trace != null && trace.isFile();
    final String bundleName = "layers".equals(call.getString("kind")) ? "blocky-layer-result.zip" : "blocky-clear-result.zip";
    final String nativeStatus = status().toString();
    writer.execute(() -> {
      try {
        File bundle = new File(getContext().getCacheDir(), bundleName);
        try (ZipOutputStream out = new ZipOutputStream(new FileOutputStream(bundle))) {
          put(out, "report.json", json.getBytes(StandardCharsets.UTF_8));
          put(out, "native-status.json", nativeStatus.getBytes(StandardCharsets.UTF_8));
          if (includeTrace) {
            out.putNextEntry(new ZipEntry("webview-trace.json"));
            try (InputStream in = new FileInputStream(trace)) {
              byte[] buffer = new byte[16384]; int count;
              while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            }
            out.closeEntry();
          }
        }
        ui.post(() -> {
          try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/zip");
            send.putExtra(Intent.EXTRA_STREAM, FileProvider.getUriForFile(getContext(), getContext().getPackageName()+".fileprovider", bundle));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, "Отправить результат проверки"));
            call.resolve();
          } catch (Exception failure) { call.reject("Cannot share diagnostic"); }
        });
      } catch (Exception failure) { call.reject("Cannot package diagnostic"); }
    });
  }); }
  private static void put(ZipOutputStream out, String name, byte[] content) throws IOException {
    out.putNextEntry(new ZipEntry(name)); out.write(content); out.closeEntry();
  }
  @Override protected void handleOnPause() { ui.post(() -> { releaseScreen(); stopOwned("background"); }); }
  @Override protected void handleOnDestroy() {
    ui.post(() -> { destroyed = true; releaseScreen(); stopOwned("destroyed"); if (!flushing) writer.shutdown(); });
  }
}
