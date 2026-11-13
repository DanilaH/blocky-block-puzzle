package com.danilah.blocky.dev;
import org.junit.Test;
import static org.junit.Assert.*;
public class IlrdPayloadTest {
  @Test public void preservesZeroAndExactDecimalWithoutDouble() {
    IlrdPayload p=IlrdPayload.parse("{\"revenue\":\"0.123456789012345678\",\"currency\":\"USD\",\"precision\":\"estimated\"}");
    assertEquals("0.123456789012345678",p.usd.toPlainString());
    assertEquals("estimated",p.precision);
    assertEquals("0",IlrdPayload.parse("{\"revenue\":\"0\",\"currency\":\"USD\"}").usd.toPlainString());
  }
  @Test public void missingAndMalformedAmountsAreUnknownNotZero() {
    for(String value:new String[]{null,"", "{}","{\"revenue\":\"NaN\",\"currency\":\"USD\"}","{\"revenue\":\"-1\",\"currency\":\"USD\"}","{\"revenue\":\"1\",\"currency\":\"WRONG\"}"}) assertNull(IlrdPayload.parse(value).usd);
  }
  @Test public void normalizesOnlyDocumentedUsdAndKeepsOriginalCurrency() {
    IlrdPayload p=IlrdPayload.parse("{\"revenue\":\"1.20\",\"currency\":\"RUB\",\"revenueUSD\":\"0.014\",\"precision\":\"publisher_defined\"}");
    assertEquals("1.20",p.revenue);assertEquals("RUB",p.currency);assertEquals("0.014",p.usd.toPlainString());
    assertNull(IlrdPayload.parse("{\"revenue\":\"1.20\",\"currency\":\"RUB\"}").usd);
  }
}
