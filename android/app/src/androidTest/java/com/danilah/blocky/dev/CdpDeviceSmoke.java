package com.danilah.blocky.dev;

import static org.junit.Assert.*;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Emulator proves same-app abstract socket and unfiltered attribution, not POCO FPS. */
@RunWith(AndroidJUnit4.class)
public class CdpDeviceSmoke {
  private String js(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
    CountDownLatch done = new CountDownLatch(1);
    AtomicReference<String> result = new AtomicReference<>();
    scenario.onActivity(
        a ->
            a.getBridge()
                .getWebView()
                .evaluateJavascript(
                    expression,
                    v -> {
                      result.set(v);
                      done.countDown();
                    }));
    assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS));
    return result.get();
  }

  @Test
  public void scoreFeedbackComparisonExportsSmallUntracedArchive() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      long until = System.currentTimeMillis() + 45000;
      while (System.currentTimeMillis() < until) {
        if (js(scenario, "!!document.querySelector('#board canvas')").equals("true")) break;
        Thread.sleep(200);
      }
      js(scenario, "location.href='https://localhost/?clearTrace=full&scoreFeedback=compare'");
      until = System.currentTimeMillis() + 45000;
      while (System.currentTimeMillis() < until) {
        if (js(scenario, "!!document.querySelector('#full-start:not(:disabled)')").equals("true"))
          break;
        Thread.sleep(200);
      }
      assertEquals("true", js(scenario, "!!window.__blockyFullDiagnostic"));
      js(scenario, "document.querySelector('#full-start').click()");
      until = System.currentTimeMillis() + 4 * 60 * 1000;
      while (System.currentTimeMillis() < until) {
        if (js(scenario, "window.__blockyFullDiagnostic.running").equals("false")) break;
        Thread.sleep(1000);
      }
      assertEquals("false", js(scenario, "window.__blockyFullDiagnostic.running"));
      JSONObject report =
          new JSONObject(
              (String)
                  new JSONTokener(
                          js(scenario, "JSON.stringify(window.__blockyFullDiagnostic.report)"))
                      .nextValue());
      assertTrue(report.optString("failure"), report.getBoolean("completed"));
      assertEquals("blocky-score-feedback-v1", report.getString("schema"));
      assertEquals(10, report.getJSONArray("episodes").length());
      assertFalse(report.getJSONObject("protocol").getBoolean("nativeTracesUsed"));
      java.io.File bundle =
          new java.io.File(
              androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                  .getTargetContext()
                  .getCacheDir(),
              "blocky-score-feedback.zip");
      if (bundle.exists()) assertTrue(bundle.delete());
      js(scenario, "document.querySelector('#full-export').click()");
      until = System.currentTimeMillis() + 30000;
      boolean ready = false;
      while (System.currentTimeMillis() < until && !ready) {
        try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(bundle)) {
          ready =
              zip.size() == 2
                  && zip.getEntry("report.json") != null
                  && zip.getEntry("manifest.json") != null;
        } catch (java.io.IOException writing) {
          Thread.sleep(200);
        }
      }
      assertTrue("Small comparison archive missing", ready);
      assertTrue("Comparison unexpectedly contains large data", bundle.length() < 1024 * 1024);
      System.out.println(
          "BLOCKY_SCORE_COMPARISON_COMPLETED 10 episodes; archive=" + bundle.length());
    }
  }

  @Test
  public void ownProcessCdpProducesLinkedPaintAndLayerData() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      long until = System.currentTimeMillis() + 45000;
      while (System.currentTimeMillis() < until) {
        try {
          if (js(scenario, "!!document.querySelector('#board canvas')").equals("true")) break;
        } catch (Exception ignored) {
        }
        Thread.sleep(200);
      }
      js(scenario, "location.href='https://localhost/?clearTrace=full'");
      until = System.currentTimeMillis() + 45000;
      while (System.currentTimeMillis() < until) {
        if (js(scenario, "!!document.querySelector('#full-start:not(:disabled)')").equals("true"))
          break;
        Thread.sleep(200);
      }
      assertEquals("true", js(scenario, "!!window.__blockyFullDiagnostic"));
      js(scenario, "document.querySelector('#full-start').click()");
      until = System.currentTimeMillis() + 15 * 60 * 1000;
      int lastCount = -1;
      while (System.currentTimeMillis() < until) {
        int count =
            Integer.parseInt(
                js(scenario, "window.__blockyFullDiagnostic.report?.episodes.length ?? 0"));
        if (count != lastCount) {
          lastCount = count;
          android.os.Bundle progress = new android.os.Bundle();
          progress.putString("stream", "BLOCKY_FULL_STEP " + count + " / 57\n");
          androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
              .sendStatus(0, progress);
          String checkpoint =
              (String)
                  new JSONTokener(
                          js(scenario, "JSON.stringify(window.__blockyFullDiagnostic.report)"))
                      .nextValue();
          java.io.File output =
              new java.io.File(
                  androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                      .getTargetContext()
                      .getCacheDir(),
                  "cdp-smoke-report.json");
          try (java.io.FileOutputStream stream = new java.io.FileOutputStream(output)) {
            stream.write(checkpoint.getBytes(java.nio.charset.StandardCharsets.UTF_8));
          }
        }
        String running = js(scenario, "window.__blockyFullDiagnostic.running");
        if (running.equals("false")) break;
        Thread.sleep(1000);
      }
      assertEquals(
          "Full run exceeded device-test deadline",
          "false",
          js(scenario, "window.__blockyFullDiagnostic.running"));
      String reportJson =
          (String)
              new JSONTokener(
                      js(
                          scenario,
                          "JSON.stringify({completed:window.__blockyFullDiagnostic.report.completed,preflight:window.__blockyFullDiagnostic.report.preflight,session:window.__blockyFullDiagnostic.report.session,failure:window.__blockyFullDiagnostic.report.failure,episodes:window.__blockyFullDiagnostic.report.episodes.map(e=>({condition:e.condition.id,phase:e.phase,valid:e.valid,errors:e.validation.errors,capture:e.capture}))})"))
                  .nextValue();
      JSONObject full = new JSONObject(reportJson);
      System.out.println("BLOCKY_FULL_CDP_REPORT " + full);
      js(scenario, "document.querySelector('#full-export').click()");
      java.io.File bundle =
          new java.io.File(
              androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                  .getTargetContext()
                  .getCacheDir(),
              "blocky-full-diagnostic.zip");
      until = System.currentTimeMillis() + 60000;
      boolean completeZip = false;
      while (System.currentTimeMillis() < until && !completeZip) {
        try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(bundle)) {
          completeZip =
              zip.getEntry("manifest.json") != null && zip.getEntry("report.json") != null;
        } catch (java.io.IOException writing) {
          Thread.sleep(200);
        }
      }
      assertTrue("Export did not produce a complete ZIP", completeZip);
      assertTrue(bundle.length() > 10000);
      assertTrue(full.toString(), full.getBoolean("completed"));
      assertEquals(57, full.getJSONArray("episodes").length());
      JSONObject ads = full.getJSONObject("session").getJSONObject("nativeAds");
      assertTrue(ads.getBoolean("suspended"));
      assertFalse(ads.getBoolean("bannerPresent"));
      assertFalse(ads.getBoolean("loadingInterstitial"));
      assertFalse(ads.getBoolean("loadingRewarded"));
      JSONObject proof = full.getJSONObject("preflight");
      assertTrue(proof.toString(), proof.getBoolean("ready"));
      assertTrue(proof.getBoolean("probePaintLayerLinked"));
      assertTrue(proof.getInt("nativeDraws") > 0);
      assertTrue(proof.getInt("paintWithNode") > 0);
      assertTrue(proof.getInt("nodeRecords") > 0);
      assertTrue(proof.getBoolean("lossStatusKnownClean"));
      System.out.println("BLOCKY_CDP_SMOKE " + proof);
      System.out.println("BLOCKY_FULL_CDP_COMPLETED 57 episodes; archive=" + bundle.length());
    }
  }
}
