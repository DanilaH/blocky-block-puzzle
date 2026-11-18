package com.danilah.blocky.dev;

import java.math.BigDecimal;
import java.util.Currency;
import java.util.Locale;
import org.json.JSONObject;

/** Decimal-only parsing. SDK estimates are measurements, never settlement amounts. */
final class IlrdPayload {
  BigDecimal usd;
  String revenue = "", currency = "", precision = "unknown", unit = "", reason = "missing_payload";
  private static BigDecimal amount(String value) {
    if (value.isEmpty() || value.length()>128) throw new IllegalArgumentException();
    BigDecimal n=new BigDecimal(value);
    if(n.signum()<0 || n.precision()>48 || Math.abs((long)n.scale())>32) throw new IllegalArgumentException();
    return n;
  }
  static IlrdPayload parse(String raw) {
    IlrdPayload p=new IlrdPayload();
    if(raw==null || raw.isEmpty()) return p;
    try {
      if(raw.length()>16384) throw new IllegalArgumentException();
      JSONObject data=new JSONObject(raw);
      Object revenue=data.opt("revenue"), currency=data.opt("currency");
      if(!(revenue instanceof String) || !(currency instanceof String)) {p.reason="missing_amount_or_currency";return p;}
      p.revenue=amount((String)revenue).toPlainString();
      p.currency=((String)currency).toUpperCase(Locale.ROOT);
      Currency.getInstance(p.currency);
      p.precision=data.optString("precision","unknown");
      p.unit=data.optString("ad_unit_id","");
      Object usd=data.opt("revenueUSD");
      if(usd instanceof String) p.usd=amount((String)usd);
      else if("USD".equals(p.currency)) p.usd=amount(p.revenue);
      else {p.reason="missing_usd";return p;}
      p.reason="known";
    } catch(Exception ignored) {p.usd=null;p.reason="invalid_payload";}
    return p;
  }
}
