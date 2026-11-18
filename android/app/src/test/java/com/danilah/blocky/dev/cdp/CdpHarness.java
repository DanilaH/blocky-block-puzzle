package com.danilah.blocky.dev.cdp;

import java.io.*;
import java.net.Socket;
import org.json.*;

/** Runs the same native client against real desktop Chromium; not a phone claim. */
public class CdpHarness {
  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(args[0]);
    CdpWire.Factory factory =
        () -> {
          Socket socket = new Socket("127.0.0.1", port);
          socket.setSoTimeout(15000);
          socket.setTcpNoDelay(true);
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
    try (CdpTrace capture = new CdpTrace(factory, new File(args[1]))) {
      boolean clear = args.length > 2 && args[2].equals("clear");
      if (clear) capture.evaluate("window.__blockyFullDiagnostic.prepare('baseline')");
      capture.start(clear ? "baseline" : "preflight");
      if (clear) {
        JSONObject row =
            capture.evaluate("window.__blockyFullDiagnostic.measure(8000)").getJSONObject("value");
        if (!row.getBoolean("valid")) throw new AssertionError(row.toString());
        JSONObject proof = row.getJSONObject("state").getJSONObject("proof");
        if (proof.getInt("shownScore") != 1574
            || proof.getInt("pendingPoints") != 0
            || proof.getJSONObject("festival").getInt("activeParticles") != 0)
          throw new AssertionError("Clear output mismatch");
      } else {
        capture.evaluate(
            "(async()=>{let"
                + " e=document.createElement('div');e.id='blocky-cdp-probe';e.textContent='CDP"
                + " test';e.style.cssText='position:fixed;left:8px;top:8px;width:160px;height:32px;background:#124;z-index:2147483647;will-change:transform;transform:translateZ(0);color:white';document.body.append(e);performance.mark('blocky-cdp-preflight:start');for(let"
                + " i=0;i<5;i++){await new"
                + " Promise(r=>setTimeout(r,80));e.style.background=i%2?'#148':'#841';e.style.width=(160+i)+'px'}performance.mark('blocky-cdp-preflight:end');return"
                + " true})()");
      }
      capture.snapshot("probe");
      JSONObject proof = capture.stop();
      System.out.println(proof.toString());
      if (!proof.getBoolean("ready")) throw new AssertionError("Missing CDP attribution");
      capture.evaluate("document.getElementById('blocky-cdp-probe')?.remove()");
    }
  }
}
