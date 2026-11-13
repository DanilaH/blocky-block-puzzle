package com.danilah.blocky.dev;

import io.appmetrica.analytics.AdRevenue;
import io.appmetrica.analytics.AppMetrica;
import java.util.Currency;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

/** One native handoff attempt per observed callback, never a JS money queue/retry. */
final class NativeRevenue {
  static void impression(String raw, String format, Map<String,String> frozen) {
    Map<String,String> payload=new HashMap<>(frozen);
    payload.put("source","blocky_ilrd_v1");
    payload.put("impressionEventId",UUID.randomUUID().toString());
    payload.put("format",format);
    IlrdPayload p=IlrdPayload.parse(raw);
    payload.put("revenue_status",p.usd==null?"unavailable":"known");
    payload.put("revenue_reason",p.reason);
    payload.put("originalRevenue",p.revenue);payload.put("originalCurrency",p.currency);
    payload.put("precision",p.precision);
    payload.put("eventSchema","2");
    if(!BlockyApplication.analyticsEnabled) return;
    try {
      if(p.usd!=null) {
        payload.put("canonicalCurrency","USD");
        payload.put("canonicalAmount",p.usd.toPlainString());
        AppMetrica.reportAdRevenue(AdRevenue.newBuilder(p.usd,Currency.getInstance("USD"))
          .withAdNetwork("Yandex").withAdUnitId(p.unit)
          .withAdPlacementName(payload.getOrDefault("placement",format))
          .withPrecision(p.precision).withPayload(payload).build());
      }
      payload.put("moneyHandoff",p.usd==null?"not_applicable":"submitted_to_sdk");
    } catch(RuntimeException ignored) {
      payload.put("moneyHandoff","unknown_after_error");
      // No blind SDK retry: a thrown/terminated handoff has unknown delivery status.
      // Reward receipts and gameplay remain independent of this diagnostic.
    }
    try { AppMetrica.reportEvent("bp_ad_impression",new JSONObject(payload).toString()); }
    catch(RuntimeException ignored) { /* No financial retry through JS. */ }
  }
}
