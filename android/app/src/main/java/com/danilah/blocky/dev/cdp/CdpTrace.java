package com.danilah.blocky.dev.cdp;

import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import org.json.*;

/** Own-WebView tracing + live layer/node mapping. Never records a different page. */
public final class CdpTrace implements Closeable {
  private final File directory;
  private CdpWire wire;
  private final ScheduledExecutorService metadata = Executors.newSingleThreadScheduledExecutor();
  private final Set<Integer> nodes = ConcurrentHashMap.newKeySet();
  private final Set<String> reasonLayers = ConcurrentHashMap.newKeySet();
  private final JSONArray reasonRecords = new JSONArray();
  private final JSONArray layerEvents = new JSONArray(),
      nodeRecords = new JSONArray(),
      domSnapshots = new JSONArray();
  private final CompletableFuture<JSONObject> finished = new CompletableFuture<>();
  private volatile boolean ownsTrace, closed, collecting = true;
  private volatile String metadataError = "";
  private volatile double maxBuffer;
  private int metadataPending;
  private final String captureId = UUID.randomUUID().toString();
  public static final String CATEGORIES =
      "toplevel,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline.invalidationTracking,blink,cc,gpu,android_webview";

  public CdpTrace(CdpWire.Factory factory, File directory) throws Exception {
    this.directory = directory;
    if (!directory.mkdirs() && !directory.isDirectory())
      throw new IOException("Cannot create diagnostic directory");
    JSONArray targets = CdpWire.targets(factory);
    String path = null;
    for (int i = 0; i < targets.length(); i++) {
      JSONObject t = targets.getJSONObject(i);
      URI url = URI.create(t.optString("url"));
      if (!"page".equals(t.optString("type")) || !"localhost".equals(url.getHost())) continue;
      if (!"https".equals(url.getScheme()) && !"http".equals(url.getScheme())) continue;
      if (path != null) throw new IOException("Ambiguous app WebView targets");
      path = URI.create(t.getString("webSocketDebuggerUrl")).getRawPath();
    }
    if (path == null) throw new IOException("Own app WebView target missing");
    try {
      wire = new CdpWire(factory, path, this::event);
      JSONObject ownership =
          wire.call(
              "Runtime.evaluate",
              new JSONObject()
                  .put(
                      "expression",
                      "!!document.querySelector('#board canvas') &&"
                          + " document.documentElement.dataset.presentation === 'classic'")
                  .put("returnByValue", true));
      if (!ownership.getJSONObject("result").optBoolean("value"))
        throw new IOException("WebView is not the Classic game");
      wire.call("DOM.enable", new JSONObject());
      snapshot("attached");
      wire.call("LayerTree.enable", new JSONObject());
      wire.call("Animation.enable", new JSONObject());
    } catch (Exception failure) {
      close();
      throw failure;
    }
  }

  private void event(JSONObject event) {
    try {
      String method = event.optString("method");
      JSONObject p = event.optJSONObject("params");
      if (p == null) return;
      if (method.equals("Tracing.tracingComplete")) {
        finished.complete(p);
        return;
      }
      if (method.equals("Tracing.bufferUsage")) {
        maxBuffer = Math.max(maxBuffer, p.optDouble("percentFull", 0));
        return;
      }
      if (!collecting) return;
      if (!method.equals("LayerTree.layerTreeDidChange")
          && !method.equals("LayerTree.layerPainted")
          && !method.startsWith("Animation.")) return;
      synchronized (layerEvents) {
        if (layerEvents.length() >= 20000) {
          metadataError = "layer-event-limit";
          return;
        }
        layerEvents.put(event);
      }
      JSONArray layers = p.optJSONArray("layers");
      if (layers == null) return;
      for (int i = 0; i < layers.length(); i++) {
        JSONObject layer = layers.getJSONObject(i);
        String layerId = layer.optString("layerId");
        if (!layerId.isEmpty() && reasonLayers.add(layerId)) {
          synchronized (this) {
            metadataPending++;
          }
          metadata.execute(
              () -> {
                JSONObject row = new JSONObject();
                try {
                  row.put("layerId", layerId)
                      .put(
                          "reasons",
                          wire.call(
                              "LayerTree.compositingReasons",
                              new JSONObject().put("layerId", layerId)));
                } catch (Exception e) {
                  try {
                    row.put("layerId", layerId).put("error", e.getClass().getSimpleName());
                  } catch (Exception ignored) {
                  }
                }
                synchronized (reasonRecords) {
                  reasonRecords.put(row);
                }
                synchronized (this) {
                  metadataPending--;
                  notifyAll();
                }
              });
        }
        int id = layer.optInt("backendNodeId");
        if (id <= 0 || !nodes.add(id)) continue;
        if (nodes.size() > 2000) {
          metadataError = "node-limit";
          continue;
        }
        synchronized (this) {
          metadataPending++;
        }
        metadata.execute(
            () -> {
              JSONObject row = new JSONObject();
              try {
                row.put("backendNodeId", id);
                row.put(
                    "node",
                    wire.call(
                            "DOM.describeNode",
                            new JSONObject().put("backendNodeId", id).put("depth", 0))
                        .getJSONObject("node"));
              } catch (Exception failure) {
                try {
                  row.put("backendNodeId", id).put("error", failure.getClass().getSimpleName());
                } catch (Exception ignored) {
                }
              }
              synchronized (nodeRecords) {
                nodeRecords.put(row);
              }
              synchronized (this) {
                metadataPending--;
                notifyAll();
              }
            });
      }
    } catch (Exception failure) {
      metadataError = failure.getClass().getSimpleName();
    }
  }

  public JSONObject evaluate(String expression) throws Exception {
    JSONObject r =
        wire.call(
            "Runtime.evaluate",
            new JSONObject()
                .put("expression", expression)
                .put("awaitPromise", true)
                .put("returnByValue", true));
    if (r.has("exceptionDetails")) throw new IOException("Diagnostic JavaScript failed");
    return r.getJSONObject("result");
  }

  public String id() {
    return captureId;
  }

  public File directory() {
    return directory;
  }

  public void start(String label) throws Exception {
    JSONObject config =
        new JSONObject()
            .put("recordMode", "recordUntilFull")
            .put("enableArgumentFilter", false)
            .put("includedCategories", new JSONArray(Arrays.asList(CATEGORIES.split(","))));
    wire.call(
        "Tracing.start",
        new JSONObject()
            .put("traceConfig", config)
            .put("transferMode", "ReturnAsStream")
            .put("bufferUsageReportingInterval", 1000));
    ownsTrace = true;
    evaluate("performance.mark(" + JSONObject.quote("blocky-full:" + label + ":trace-start") + ")");
    if (!label.equals("preflight"))
      for (int delay : new int[] {450, 900, 1200, 2300, 3400})
        metadata.schedule(
            () -> {
              try {
                snapshot("after-" + delay);
              } catch (Exception e) {
                metadataError = "dom-snapshot-failed";
              }
            },
            delay,
            TimeUnit.MILLISECONDS);
  }

  public JSONObject stop() throws Exception {
    if (!ownsTrace) throw new IOException("No trace owned by this capture");
    wire.call("Tracing.end", new JSONObject());
    ownsTrace = false;
    JSONObject completion = finished.get(15, TimeUnit.SECONDS);
    collecting = false;
    String stream = completion.getString("stream");
    long rawBytes = 0;
    long flushStarted = System.nanoTime();
    File trace = new File(directory, "trace.json.gz");
    long flushDeadline = System.currentTimeMillis() + 45000;
    try (OutputStream output =
        new GZIPOutputStream(new BufferedOutputStream(new FileOutputStream(trace), 32768), 32768) {
          {
            def.setLevel(Deflater.BEST_SPEED);
          }
        }) {
      for (; ; ) {
        if (System.currentTimeMillis() > flushDeadline)
          throw new IOException("trace-flush-timeout");
        JSONObject r =
            wire.call("IO.read", new JSONObject().put("handle", stream).put("size", 262144));
        String data = r.optString("data");
        byte[] bytes =
            r.optBoolean("base64Encoded")
                ? Base64.getDecoder().decode(data)
                : data.getBytes(StandardCharsets.UTF_8);
        rawBytes += bytes.length;
        if (rawBytes > 128L * 1024 * 1024) throw new IOException("trace-uncompressed-limit");
        output.write(bytes);
        if (r.optBoolean("eof")) break;
      }
    } finally {
      wire.call("IO.close", new JSONObject().put("handle", stream));
    }
    try {
      metadata.submit(() -> {}).get(10, TimeUnit.SECONDS);
    } catch (Exception timeout) {
      metadataError = "metadata-drain-timeout";
    }
    JSONObject mapping = new JSONObject();
    synchronized (layerEvents) {
      mapping.put("layers", new JSONArray(layerEvents.toString()));
    }
    synchronized (nodeRecords) {
      mapping.put("nodes", new JSONArray(nodeRecords.toString()));
    }
    synchronized (domSnapshots) {
      mapping.put("domSnapshots", new JSONArray(domSnapshots.toString()));
    }
    synchronized (reasonRecords) {
      mapping.put("compositingReasons", new JSONArray(reasonRecords.toString()));
    }
    mapping.put("error", metadataError);
    try (Writer writer =
        new OutputStreamWriter(
            new FileOutputStream(new File(directory, "layers.json")), StandardCharsets.UTF_8)) {
      writer.write(mapping.toString());
    }
    long inspectStarted = System.nanoTime();
    JSONObject proof = inspect(trace);
    proof.put("inspectMs", (System.nanoTime() - inspectStarted) / 1000000.0);
    proof.put("streamAndMetadataMs", (inspectStarted - flushStarted) / 1000000.0);
    boolean probeLinked = probeLinked(proof, nodeRecords, layerEvents);
    proof.put("probePaintLayerLinked", probeLinked);
    int successfulNodes = 0, successfulReasons = 0;
    for (int i = 0; i < nodeRecords.length(); i++)
      if (nodeRecords.getJSONObject(i).has("node")) successfulNodes++;
    for (int i = 0; i < reasonRecords.length(); i++)
      if (reasonRecords.getJSONObject(i).has("reasons")) successfulReasons++;
    proof
        .put("successfulNodeRecords", successfulNodes)
        .put("compositingReasonsSuccess", successfulReasons)
        .put("domSnapshots", domSnapshots.length());
    proof
        .put("captureId", captureId)
        .put("rawBytes", rawBytes)
        .put("compressedBytes", trace.length())
        .put("maxBufferUsage", maxBuffer)
        .put("nodeRecords", nodeRecords.length())
        .put("layerEvents", layerEvents.length())
        .put("metadataError", metadataError);
    boolean loss = completion.has("dataLossOccurred") && !completion.getBoolean("dataLossOccurred");
    proof.put("lossStatusKnownClean", loss);
    proof.put(
        "ready",
        loss
            && metadataError.isEmpty()
            && maxBuffer < 0.95
            && proof.optInt("paintWithNode") > 0
            && proof.optInt("namedMarks") > 0
            && successfulNodes > 0
            && successfulReasons > 0
            && domSnapshots.length() > 0
            && proof.optInt("gpuEvents") > 0);
    proof.put("directory", directory.getName());
    try (Writer writer =
        new OutputStreamWriter(
            new FileOutputStream(new File(directory, "capture.json")), StandardCharsets.UTF_8)) {
      writer.write(proof.toString());
    }
    return proof;
  }

  /** Chromium emits either node-addressed Paint or layer-addressed Paint instants. */
  public static boolean probeLinked(JSONObject proof, JSONArray nodeRecords, JSONArray layerEvents)
      throws Exception {
    boolean probeLinked = false;
    Set<String> paintedLayers = new HashSet<>();
    JSONArray layersPainted = proof.optJSONArray("paintLayerIds");
    if (layersPainted != null)
      for (int i = 0; i < layersPainted.length(); i++)
        paintedLayers.add(layersPainted.getString(i));
    Set<String> probeLayers = new HashSet<>();
    Set<Long> paintedNodes = new HashSet<>();
    JSONArray painted = proof.getJSONArray("paintBackendNodeIds");
    for (int i = 0; i < painted.length(); i++) paintedNodes.add(painted.getLong(i));
    for (int i = 0; i < nodeRecords.length(); i++) {
      JSONObject row = nodeRecords.getJSONObject(i), n = row.optJSONObject("node");
      if (n == null) continue;
      JSONArray attrs = n.optJSONArray("attributes");
      if (attrs == null) continue;
      for (int j = 0; j + 1 < attrs.length(); j += 2)
        if (attrs.getString(j).equals("id") && attrs.getString(j + 1).equals("blocky-cdp-probe")) {
          long backend = n.getLong("backendNodeId");
          for (int k = 0; k < layerEvents.length(); k++) {
            JSONObject ev = layerEvents.getJSONObject(k);
            JSONArray ls = ev.getJSONObject("params").optJSONArray("layers");
            if (ls != null)
              for (int z = 0; z < ls.length(); z++)
                if (ls.getJSONObject(z).optLong("backendNodeId") == backend)
                  probeLayers.add(ls.getJSONObject(z).getString("layerId"));
          }
          boolean layerPaint = false;
          for (int k = 0; k < layerEvents.length(); k++) {
            JSONObject ev = layerEvents.getJSONObject(k);
            if (ev.optString("method").equals("LayerTree.layerPainted")
                && probeLayers.contains(ev.getJSONObject("params").optString("layerId")))
              layerPaint = true;
          }
          probeLinked =
              (paintedNodes.contains(backend) || !Collections.disjoint(probeLayers, paintedLayers))
                  && layerPaint;
        }
    }
    return probeLinked;
  }

  public static JSONObject inspect(File file) throws Exception {
    int events = 0,
        paint = 0,
        paintWithNode = 0,
        marks = 0,
        gpu = 0,
        flows = 0,
        nativeDraws = 0,
        syncWaits = 0;
    Set<Long> paintNodes = new TreeSet<>();
    Set<String> paintLayers = new TreeSet<>();
    boolean root = false;
    try (Reader reader =
        new InputStreamReader(
            new GZIPInputStream(new FileInputStream(file)), StandardCharsets.UTF_8)) {
      PushbackReader t = new PushbackReader(new BufferedReader(reader, 32768), 1);
      if (clean(t) != '{') throw new IOException("Trace root is not an object");
      for (; ; ) {
        int c = clean(t);
        if (c == '}') break;
        t.unread(c);
        String key = (String) new JSONTokener(value(t)).nextValue();
        if (clean(t) != ':') throw new IOException("Trace key");
        if (key.equals("traceEvents")) {
          root = true;
          if (clean(t) != '[') throw new IOException("Trace events missing");
          for (; ; ) {
            c = clean(t);
            if (c == ']') break;
            t.unread(c);
            JSONObject e = new JSONObject(value(t));
            events++;
            String name = e.optString("name"), cat = e.optString("cat"), ph = e.optString("ph");
            if (name.equals("Paint")) {
              paint++;
              if (hasIdentity(e.optJSONObject("args"))) paintWithNode++;
              collectNodeIds(e.optJSONObject("args"), paintNodes);
              JSONObject data =
                  e.optJSONObject("args") == null
                      ? null
                      : e.getJSONObject("args").optJSONObject("data");
              if (data != null && data.has("layerId") && !data.optString("layerId").equals("0"))
                paintLayers.add(data.get("layerId").toString());
            }
            if (name.startsWith("blocky-full:") || name.startsWith("blocky-cdp-preflight:"))
              marks++;
            if (Arrays.asList(cat.split(",")).contains("gpu")) gpu++;
            if (ph.equals("s") || ph.equals("f")) flows++;
            if (name.startsWith("DrawFn_Draw")) nativeDraws++;
            if (name.contains("RunAllTasks::WaitSyncToken")) syncWaits++;
            c = clean(t);
            if (c == ']') break;
            if (c != ',') throw new IOException("Trace array separator");
          }
        } else value(t);
        c = clean(t);
        if (c == '}') break;
        if (c != ',') throw new IOException("Trace root separator");
      }
      if (clean(t) != -1 || !root) throw new IOException("Incomplete trace JSON");
    }
    return new JSONObject()
        .put("events", events)
        .put("paint", paint)
        .put("paintWithNode", paintWithNode)
        .put("namedMarks", marks)
        .put("gpuEvents", gpu)
        .put("flowEndpoints", flows)
        .put("nativeDraws", nativeDraws)
        .put("syncWaits", syncWaits)
        .put("paintBackendNodeIds", new JSONArray(paintNodes))
        .put("paintLayerIds", new JSONArray(paintLayers));
  }

  public void snapshot(String label) throws Exception {
    JSONObject document = wire.call("DOM.getDocument", new JSONObject().put("depth", -1));
    JSONObject layout =
        wire.call(
            "DOMSnapshot.captureSnapshot",
            new JSONObject()
                .put(
                    "computedStyles",
                    new JSONArray(
                        Arrays.asList(
                            "color",
                            "background-color",
                            "transform",
                            "opacity",
                            "font-size",
                            "filter",
                            "text-shadow",
                            "will-change",
                            "contain")))
                .put("includePaintOrder", true)
                .put("includeDOMRects", true));
    JSONObject sample =
        new JSONObject().put("label", label).put("document", document).put("layout", layout);
    synchronized (domSnapshots) {
      if (domSnapshots.length() >= 8) throw new IOException("DOM snapshot limit");
      domSnapshots.put(sample);
    }
  }

  private static int clean(PushbackReader r) throws IOException {
    int c;
    do {
      c = r.read();
    } while (c >= 0 && c <= 32);
    return c;
  }

  private static String value(PushbackReader r) throws IOException {
    int first = clean(r);
    if (first < 0) throw new EOFException("Truncated trace value");
    StringBuilder out = new StringBuilder();
    out.append((char) first);
    if (first != '{' && first != '[' && first != '"') {
      for (; ; ) {
        int c = r.read();
        if (c < 0) break;
        if (c == ',' || c == '}' || c == ']' || c <= 32) {
          r.unread(c);
          break;
        }
        out.append((char) c);
        if (out.length() > 1000) throw new IOException("Primitive limit");
      }
      return out.toString();
    }
    int depth = (first == '{' || first == '[') ? 1 : 0;
    boolean quoted = first == '"', escape = false;
    boolean compound = depth > 0;
    for (; ; ) {

      int c = r.read();
      if (c < 0) {
        if (compound || quoted) throw new EOFException("Truncated trace value");
        break;
      }
      if (!compound && !quoted && (c == ',' || c == '}' || c == ']' || c <= 32)) {
        r.unread(c);
        break;
      }
      out.append((char) c);
      if (out.length() > 8 * 1024 * 1024) throw new IOException("Trace event limit");
      if (quoted) {
        if (escape) escape = false;
        else if (c == '\\') escape = true;
        else if (c == '"') {
          quoted = false;
          if (!compound) break;
        }
      } else if (c == '"') quoted = true;
      else if (c == '{' || c == '[') depth++;
      else if (c == '}' || c == ']') {
        if (--depth == 0) break;
      }
    }
    return out.toString();
  }

  private static void collectNodeIds(Object value, Set<Long> result) throws Exception {
    if (value instanceof JSONObject) {
      JSONObject o = (JSONObject) value;
      for (Iterator<String> it = o.keys(); it.hasNext(); ) {
        String key = it.next();
        Object child = o.get(key);
        if ((key.equals("nodeId") || key.equals("backendNodeId")) && child instanceof Number)
          result.add(((Number) child).longValue());
        else collectNodeIds(child, result);
      }
    } else if (value instanceof JSONArray) {
      JSONArray a = (JSONArray) value;
      for (int i = 0; i < a.length(); i++) collectNodeIds(a.get(i), result);
    }
  }

  private static boolean hasIdentity(Object value) throws Exception {
    if (value instanceof JSONObject) {
      JSONObject o = (JSONObject) value;
      for (java.util.Iterator<String> it = o.keys(); it.hasNext(); ) {
        String key = it.next();
        Object child = o.get(key);
        if ((key.equals("nodeId") || key.equals("backendNodeId"))
            && child instanceof Number
            && ((Number) child).longValue() > 0) return true;
        if (hasIdentity(child)) return true;
      }
    } else if (value instanceof JSONArray) {
      JSONArray a = (JSONArray) value;
      for (int i = 0; i < a.length(); i++) if (hasIdentity(a.get(i))) return true;
    }
    return false;
  }

  @Override
  public void close() throws IOException {
    if (closed) return;
    closed = true;
    if (ownsTrace && wire != null) {
      try {
        wire.call("Tracing.end", new JSONObject());
      } catch (Exception ignored) {
      }
      ownsTrace = false;
    }
    if (wire != null) wire.close();
    metadata.shutdownNow();
  }
}
