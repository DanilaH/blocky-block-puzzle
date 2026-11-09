package com.danilah.blocky.dev.cdp;

import static org.junit.Assert.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class CdpTraceTest {
  private File file(String text) throws Exception {
    File f = File.createTempFile("blocky-cdp", ".gz");
    f.deleteOnExit();
    try (OutputStream o = new GZIPOutputStream(new FileOutputStream(f))) {
      o.write(text.getBytes(StandardCharsets.UTF_8));
    }
    return f;
  }

  @Test
  public void inspectsStreamingEventsWithoutLoadingTheWholeTrace() throws Exception {
    JSONObject p =
        CdpTrace.inspect(
            file(
                "{\"traceEvents\":[{\"name\":\"Paint\",\"args\":{\"data\":{\"nodeId\":177,\"text\":\"\\\""
                    + " ] } \\\\"
                    + " кириллица\"}}},{\"name\":\"blocky-full:test\",\"cat\":\"blink.user_timing\"},{\"name\":\"DrawFn_DrawGL\",\"cat\":\"gpu\",\"ph\":\"s\"}],\"metadata\":{\"ok\":true,\"nullable\":null}}"));
    assertEquals(3, p.getInt("events"));
    assertEquals(1, p.getInt("paintWithNode"));
    assertEquals(177, p.getJSONArray("paintBackendNodeIds").getInt(0));
    assertEquals(1, p.getInt("nativeDraws"));
    assertEquals(1, p.getInt("namedMarks"));
  }

  @Test
  public void filteredPaintHasNoAttribution() throws Exception {
    JSONObject p = CdpTrace.inspect(file("{\"traceEvents\":[{\"name\":\"Paint\",\"args\":{}}]}"));
    assertEquals(1, p.getInt("paint"));
    assertEquals(0, p.getInt("paintWithNode"));
  }

  @Test
  public void rejectsTruncation() throws Exception {
    try {
      CdpTrace.inspect(file("{\"traceEvents\":[{\"name\":\"Paint\""));
      fail("Must reject truncated trace");
    } catch (Exception expected) {
    }
  }

  @Test
  public void rejectsMissingEventArray() throws Exception {
    try {
      CdpTrace.inspect(file("{\"metadata\":{}}"));
      fail("Must reject missing traceEvents");
    } catch (Exception expected) {
    }
  }

  @org.junit.Test
  public void linksLayerAddressedAndroidPaintWithoutRequiringProbeNodeOnPaint() throws Exception {
    JSONObject proof = new JSONObject("{\"paintBackendNodeIds\":[9],\"paintLayerIds\":[\"48\"]}");
    JSONArray nodes =
        new JSONArray(
            "[{\"backendNodeId\":180,\"node\":{\"backendNodeId\":180,\"attributes\":[\"id\",\"blocky-cdp-probe\"]}}]");
    JSONArray layers =
        new JSONArray(
            "[{\"method\":\"LayerTree.layerTreeDidChange\",\"params\":{\"layers\":[{\"layerId\":\"48\",\"backendNodeId\":180}]}},{\"method\":\"LayerTree.layerPainted\",\"params\":{\"layerId\":\"48\"}}]");
    org.junit.Assert.assertTrue(CdpTrace.probeLinked(proof, nodes, layers));
    proof.put("paintLayerIds", new JSONArray().put("99"));
    org.junit.Assert.assertFalse(CdpTrace.probeLinked(proof, nodes, layers));
    proof.put("paintLayerIds", new JSONArray().put("48"));
    layers.remove(1);
    org.junit.Assert.assertFalse(CdpTrace.probeLinked(proof, nodes, layers));
  }
}
