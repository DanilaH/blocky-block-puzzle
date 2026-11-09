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
      while (System.currentTimeMillis() < until) {
        String running = js(scenario, "window.__blockyFullDiagnostic.running");
        if (running.equals("false")) break;
        Thread.sleep(1000);
      }
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
      until = System.currentTimeMillis() + 30000;
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
