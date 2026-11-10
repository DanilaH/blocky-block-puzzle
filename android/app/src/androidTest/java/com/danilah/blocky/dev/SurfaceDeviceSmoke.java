package com.danilah.blocky.dev;

import static org.junit.Assert.*;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Actual production WebView transport/output checks; emulator RAF is not POCO FPS. */
@RunWith(AndroidJUnit4.class)
public class SurfaceDeviceSmoke {
  private String js(ActivityScenario<MainActivity> scenario,String expression)throws Exception {
    CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
    scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript(expression,v->{result.set(v);done.countDown();}));
    assertTrue("WebView evaluation timed out",done.await(10,TimeUnit.SECONDS));return result.get();
  }
  private void waitFor(ActivityScenario<MainActivity> scenario,String expression,long timeout)throws Exception {
    long until=System.currentTimeMillis()+timeout;
    while(System.currentTimeMillis()<until){if("true".equals(js(scenario,expression)))return;Thread.sleep(200);}
    fail("WebView condition timed out: "+expression+"; "+js(scenario,"document.body.innerText"));
  }
  private void open(ActivityScenario<MainActivity> scenario)throws Exception {
    waitFor(scenario,"document.documentElement.dataset.themeSurfaces==='generated'&&!document.querySelector('#app').inert",45000);
    js(scenario,"location.href='https://localhost/?clearTrace=surfaces'");
    waitFor(scenario,"!!window.__blockySurfaceComparison&&!document.querySelector('#surface-start').disabled",45000);
  }
  @Test public void backgroundCancellationCannotBecomeACompletedComparison()throws Exception {
    try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
      open(scenario);js(scenario,"document.querySelector('#surface-start').click()");
      waitFor(scenario,"window.__blockySurfaceComparison.running",10000);
      scenario.moveToState(Lifecycle.State.CREATED);Thread.sleep(1000);scenario.moveToState(Lifecycle.State.RESUMED);
      waitFor(scenario,"!window.__blockySurfaceComparison.running",15000);
      assertEquals("false",js(scenario,"window.__blockySurfaceComparison.report.completed"));
      assertEquals("false",js(scenario,"window.__blockySurfaceComparison.report.summary.improved"));
      assertEquals("true",js(scenario,"!document.querySelector('#surface-start').disabled"));
    }
  }
  @Test public void fullShortComparisonExportsSmallJsonAndKeepsOrdinarySaves()throws Exception {
    try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
      waitFor(scenario,"document.documentElement.dataset.themeSurfaces==='generated'&&!document.querySelector('#app').inert",45000);
      js(scenario,"window.__ordinary=null;{const r=indexedDB.open('blocky-classic');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('save');const s=tx.objectStore('save');const a=s.getAll(),b=s.getAllKeys();tx.oncomplete=()=>{window.__ordinary=JSON.stringify([b.result,a.result]);db.close();};};}");
      waitFor(scenario,"typeof window.__ordinary==='string'",10000);String before=js(scenario,"window.__ordinary");
      js(scenario,"location.href='https://localhost/?clearTrace=surfaces'");
      waitFor(scenario,"!!window.__blockySurfaceComparison&&!document.querySelector('#surface-start').disabled",45000);
      js(scenario,"document.querySelector('#surface-start').click()");
      waitFor(scenario,"!window.__blockySurfaceComparison.running&&!!window.__blockySurfaceComparison.report",150000);
      JSONObject report=new JSONObject((String)new JSONTokener(js(scenario,"JSON.stringify(window.__blockySurfaceComparison.report)")).nextValue());
      assertTrue(report.toString(),report.getBoolean("completed"));assertEquals(10,report.getJSONArray("episodes").length());
      assertFalse(report.getJSONObject("protocol").getBoolean("traces"));assertFalse(report.getJSONObject("summary").getBoolean("improved"));
      assertFalse("Emulator cannot be a physical result",report.getBoolean("physical"));
      for(int i=0;i<10;i++)assertTrue(report.getJSONArray("episodes").getJSONObject(i).toString(),report.getJSONArray("episodes").getJSONObject(i).getBoolean("valid"));
      js(scenario,"window.__ordinary=null;{const r=indexedDB.open('blocky-classic');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('save');const s=tx.objectStore('save');const a=s.getAll(),b=s.getAllKeys();tx.oncomplete=()=>{window.__ordinary=JSON.stringify([b.result,a.result]);db.close();};};}");
      waitFor(scenario,"typeof window.__ordinary==='string'",10000);assertEquals(before,js(scenario,"window.__ordinary"));
      File out=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"blocky-surfaces.json");
      if(out.exists())assertTrue(out.delete());js(scenario,"document.querySelector('#surface-share').click()");
      long until=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<until&&(!out.exists()||out.length()==0))Thread.sleep(100);
      assertTrue("Missing bounded JSON export",out.exists()&&out.length()>0&&out.length()<900000);
      assertEquals("blocky-surface-comparison-v1",new JSONObject(new String(java.nio.file.Files.readAllBytes(out.toPath()),java.nio.charset.StandardCharsets.UTF_8)).getString("schema"));
      System.out.println("BLOCKY_SURFACES_COMPLETED 10/10 valid; JSON="+out.length());
    }
  }
}
