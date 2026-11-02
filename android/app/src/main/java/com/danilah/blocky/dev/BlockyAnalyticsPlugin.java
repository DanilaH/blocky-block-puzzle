package com.danilah.blocky.dev;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.appmetrica.analytics.AppMetrica;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashSet;

@CapacitorPlugin(name = "BlockyAnalytics")
public class BlockyAnalyticsPlugin extends Plugin {
  // Transport retries only. Durable gameplay dedup belongs to ProfileStore.
  private final LinkedHashSet<String> sent = new LinkedHashSet<>();
  @PluginMethod public void initialize(PluginCall call) {
    call.resolve(new JSObject().put("enabled", BlockyApplication.analyticsEnabled));
  }
  @PluginMethod public synchronized void report(PluginCall call) {
    if (!BlockyApplication.analyticsEnabled) { call.resolve(); return; }
    try {
      JSONArray events = call.getArray("events");
      if (events == null || events.length() > 32) { call.reject("Invalid batch"); return; }
      // Validate the whole batch before reporting any event.
      for (int i=0; i<events.length(); i++) {
        JSONObject e=events.getJSONObject(i), p=e.getJSONObject("params");
        if (!e.getString("name").matches("[a-z][a-z_]{1,48}") ||
            p.optString("eventId").isEmpty() || p.toString().length()>4096) {
          call.reject("Invalid event"); return;
        }
      }
      for (int i=0; i<events.length(); i++) {
        JSONObject e=events.getJSONObject(i), p=e.getJSONObject("params");
        String id=p.getString("eventId");
        if (sent.contains(id)) continue;
        AppMetrica.reportEvent(e.getString("name"), p.toString());
        sent.add(id);
        if (sent.size()>512) sent.remove(sent.iterator().next());
      }
      call.resolve();
    } catch (Exception ignored) { call.reject("Analytics unavailable"); }
  }
}
