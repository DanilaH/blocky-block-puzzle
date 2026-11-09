package com.danilah.blocky.dev;

import android.content.*;
import android.content.pm.ApplicationInfo;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.*;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import com.danilah.blocky.dev.cdp.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import org.json.*;

/** Explicit preview-only, own-process CDP. No TCP listener, upload or user-profile access. */
@CapacitorPlugin(name = "BlockyCdp")
public class BlockyCdpPlugin extends Plugin {
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler ui = new Handler(Looper.getMainLooper());
  private volatile CdpTrace active;
  private volatile boolean stopped, screenOwned;
  private File session;
  private int sequence;
  private JSONObject preflight = new JSONObject();

  private boolean supported() {
    return Build.VERSION.SDK_INT >= 28
        && (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }

  private CdpWire.Factory sockets() {
    return () -> {
      LocalSocket socket = new LocalSocket();
      socket.connect(
          new LocalSocketAddress(
              "webview_devtools_remote_" + android.os.Process.myPid(),
              LocalSocketAddress.Namespace.ABSTRACT));
      socket.setSoTimeout(15000);
      return new CdpWire.Transport() {
        public InputStream input() throws IOException {
          return socket.getInputStream();
        }

        public OutputStream output() throws IOException {
          return socket.getOutputStream();
        }

        public void close() throws IOException {
          socket.close();
        }
      };
    };
  }

  private void task(PluginCall call, Work work) {
    worker.execute(
        () -> {
          try {
            if (stopped || !supported()) throw new IOException("cdp-unavailable-in-this-build");
            call.resolve(JSObject.fromJSONObject(work.run()));
          } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
          }
        });
  }

  private interface Work {
    JSONObject run() throws Exception;
  }

  private static long bytes(File file) {
    if (file.isFile()) return file.length();
    long size = 0;
    File[] children = file.listFiles();
    if (children != null) for (File c : children) size += bytes(c);
    return size;
  }

  private static void remove(File file) throws IOException {
    File[] children = file.listFiles();
    if (children != null) for (File c : children) remove(c);
    if (file.exists() && !file.delete()) throw new IOException("Cannot clear previous diagnostic");
  }

  private void closeActive() {
    CdpTrace c = active;
    active = null;
    if (c != null)
      try {
        c.close();
      } catch (Exception ignored) {
      }
  }

  private File next(String name) throws IOException {
    if (session == null) throw new IOException("diagnostic-session-not-reset");
    if (bytes(session) > 256L * 1024 * 1024) throw new IOException("diagnostic-compressed-limit");
    File directory = new File(session, String.format(Locale.ROOT, "%02d-%s", ++sequence, name));
    if (!directory.mkdirs()) throw new IOException("Cannot create capture directory");
    return directory;
  }

  @PluginMethod
  public void reset(PluginCall call) {
    task(
        call,
        () -> {
          closeActive();
          File root = new File(getContext().getCacheDir(), "blocky-full-diagnostic");
          remove(root);
          if (!root.mkdirs()) throw new IOException("Cannot create diagnostic session");
          session = root;
          sequence = 0;
          preflight = new JSONObject();
          return new JSONObject()
              .put("supported", true)
              .put("sessionId", UUID.randomUUID().toString());
        });
  }

  @PluginMethod
  public void preflight(PluginCall call) {
    task(
        call,
        () -> {
          closeActive();
          File directory = next("preflight");
          try (CdpTrace capture = new CdpTrace(sockets(), directory)) {
            active = capture;
            capture.start("preflight");
            capture.evaluate(
                "(async()=>{let"
                    + " e=document.createElement('div');e.id='blocky-cdp-probe';e.textContent='Проверка"
                    + " записи';e.style.cssText='position:fixed;left:8px;top:8px;width:160px;height:32px;color:white;background:#124;z-index:2147483647;will-change:transform;transform:translateZ(0);font:16px"
                    + " sans-serif';document.body.append(e);performance.mark('blocky-cdp-preflight:start');for(let"
                    + " i=0;i<5;i++){await new"
                    + " Promise(r=>setTimeout(r,80));e.style.background=i%2?'#148':'#841';e.style.width=(160+i)+'px'}performance.mark('blocky-cdp-preflight:end');return"
                    + " true})()");
            capture.snapshot("preflight-probe");
            preflight = capture.stop();
            capture.evaluate("document.getElementById('blocky-cdp-probe')?.remove()");
            preflight.put("provider", "own-process-cdp").put("categories", CdpTrace.CATEGORIES);
            boolean complete =
                preflight.optBoolean("ready")
                    && preflight.optBoolean("probePaintLayerLinked")
                    && preflight.optInt("nativeDraws") > 0
                    && preflight.optInt("flowEndpoints") > 0;
            preflight.put("ready", complete);
            if (!complete) preflight.put("error", "missing-unfiltered-paint-layer-or-native-data");
            writeJson(new File(directory, "capture.json"), preflight.toString());
            return preflight;
          } finally {
            active = null;
          }
        });
  }

  @PluginMethod
  public void start(PluginCall call) {
    String condition = call.getString("condition", "");
    task(
        call,
        () -> {
          if (!preflight.optBoolean("ready")) throw new IOException("cdp-preflight-required");
          if (!condition.matches("[a-z0-9-]{1,60}"))
            throw new IOException("Invalid capture condition");
          closeActive();
          File directory = next(condition);
          CdpTrace capture = new CdpTrace(sockets(), directory);
          active = capture;
          try {
            capture.start(condition);
            return new JSONObject()
                .put("captureId", capture.id())
                .put("recording", true)
                .put("directory", directory.getName());
          } catch (Exception e) {
            closeActive();
            throw e;
          }
        });
  }

  @PluginMethod
  public void stop(PluginCall call) {
    String expected = call.getString("captureId", "");
    task(
        call,
        () -> {
          CdpTrace capture = active;
          if (capture == null || !capture.id().equals(expected))
            throw new IOException("cdp-capture-id-mismatch");
          try {
            JSONObject proof = capture.stop();
            proof.put(
                "ready",
                proof.optBoolean("ready")
                    && proof.optInt("nativeDraws") > 0
                    && proof.optInt("flowEndpoints") > 0);
            writeJson(new File(capture.directory(), "capture.json"), proof.toString());
            return proof;
          } finally {
            closeActive();
          }
        });
  }

  @PluginMethod
  public void abort(PluginCall call) {
    task(
        call,
        () -> {
          closeActive();
          return new JSONObject().put("aborted", true);
        });
  }

  @PluginMethod
  public void device(PluginCall call) {
    task(
        call,
        () -> {
          JSONObject state =
              new JSONObject()
                  .put("sdk", Build.VERSION.SDK_INT)
                  .put("elapsedRealtimeMs", SystemClock.elapsedRealtime());
          Intent battery =
              getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
          if (battery != null)
            state
                .put(
                    "batteryTemperatureC",
                    battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) / 10.0)
                .put("batteryLevel", battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1));
          if (Build.VERSION.SDK_INT >= 29) {
            PowerManager power =
                (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            state.put("thermalStatus", power.getCurrentThermalStatus());
          }
          if (Build.VERSION.SDK_INT >= 26) {
            android.content.pm.PackageInfo provider =
                android.webkit.WebView.getCurrentWebViewPackage();
            if (provider != null) state.put("webViewVersion", provider.versionName);
          }
          return state;
        });
  }

  @PluginMethod
  public void setScreenOn(PluginCall call) {
    ui.post(
        () -> {
          if (call.getBoolean("enabled", false) && supported()) {
            if ((getActivity().getWindow().getAttributes().flags
                    & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                == 0) {
              getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
              screenOwned = true;
            }
          } else releaseScreen();
          call.resolve();
        });
  }

  private void releaseScreen() {
    if (screenOwned) {
      getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      screenOwned = false;
    }
  }

  private static void writeJson(File file, String json) throws IOException {
    try (Writer w = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
      w.write(json);
    }
  }

  private static void manifest(File root, File file, String prefix, JSONArray result)
      throws Exception {
    File[] children = file.listFiles();
    if (children == null) throw new IOException("Missing diagnostic directory");
    Arrays.sort(children, Comparator.comparing(File::getName));
    for (File child : children) {
      String name = prefix + child.getName();
      if (child.isDirectory()) manifest(root, child, name + "/", result);
      else if (!name.equals("manifest.json")) {
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(child)) {
          byte[] buffer = new byte[32768];
          int n;
          while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n);
        }
        StringBuilder hash = new StringBuilder();
        for (byte x : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", x & 255));
        result.put(
            new JSONObject()
                .put("path", name)
                .put("bytes", child.length())
                .put("sha256", hash.toString()));
      }
    }
  }

  @PluginMethod
  public void share(PluginCall call) {
    String json = call.getString("json", "");
    worker.execute(
        () -> {
          try {
            if (stopped
                || !supported()
                || active != null
                || session == null
                || json.isEmpty()
                || json.getBytes(StandardCharsets.UTF_8).length > 8 * 1024 * 1024)
              throw new IOException("diagnostic-not-ready-to-share");
            writeJson(new File(session, "report.json"), json);
            JSONArray files = new JSONArray();
            manifest(session, session, "", files);
            writeJson(
                new File(session, "manifest.json"),
                new JSONObject()
                    .put("schema", "blocky-full-manifest-v1")
                    .put("files", files)
                    .toString());
            File bundle = new File(getContext().getCacheDir(), "blocky-full-diagnostic.zip");
            try (ZipOutputStream out =
                new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(bundle)))) {
              pack(out, session, "");
            }
            ui.post(
                () -> {
                  try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("application/zip");
                    send.putExtra(
                        Intent.EXTRA_STREAM,
                        FileProvider.getUriForFile(
                            getContext(), getContext().getPackageName() + ".fileprovider", bundle));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    getActivity()
                        .startActivity(Intent.createChooser(send, "Отправить полную диагностику"));
                    call.resolve(new JSObject().put("opened", true).put("bytes", bundle.length()));
                  } catch (Exception failure) {
                    call.reject("Cannot open diagnostic share sheet");
                  }
                });
          } catch (Exception failure) {
            call.reject(failure.getMessage());
          }
        });
  }

  private static void pack(ZipOutputStream out, File file, String prefix) throws IOException {
    File[] children = file.listFiles();
    if (children == null) throw new IOException("Missing diagnostic directory");
    Arrays.sort(children, Comparator.comparing(File::getName));
    for (File child : children) {
      String name = prefix + child.getName();
      if (child.isDirectory()) pack(out, child, name + "/");
      else {
        out.putNextEntry(new ZipEntry(name));
        try (InputStream in = new FileInputStream(child)) {
          byte[] buffer = new byte[32768];
          int n;
          while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
        }
        out.closeEntry();
      }
    }
  }

  @Override
  protected void handleOnPause() {
    ui.post(this::releaseScreen);
    new Thread(this::closeActive, "blocky-cdp-pause").start();
  }

  @Override
  protected void handleOnDestroy() {
    stopped = true;
    ui.post(this::releaseScreen);
    worker.execute(
        () -> {
          closeActive();
          worker.shutdown();
        });
  }
}
