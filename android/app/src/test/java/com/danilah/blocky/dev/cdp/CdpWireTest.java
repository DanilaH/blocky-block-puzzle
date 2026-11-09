package com.danilah.blocky.dev.cdp;

import static org.junit.Assert.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;
import org.junit.Test;

public class CdpWireTest {
  private CdpWire.Factory factory(ServerSocket server) {
    return () -> {
      Socket s = new Socket("127.0.0.1", server.getLocalPort());
      s.setSoTimeout(3000);
      return new CdpWire.Transport() {
        public InputStream input() throws IOException {
          return s.getInputStream();
        }

        public OutputStream output() throws IOException {
          return s.getOutputStream();
        }

        public void close() throws IOException {
          s.close();
        }
      };
    };
  }

  private String requestHeaders(InputStream in) throws Exception {
    ByteArrayOutputStream b = new ByteArrayOutputStream();
    int suffix = 0;
    while (suffix != 0x0d0a0d0a) {
      int x = in.read();
      if (x < 0) throw new EOFException();
      b.write(x);
      suffix = (suffix << 8) | x;
    }
    return b.toString("US-ASCII");
  }

  private void accept(Socket s, boolean valid) throws Exception {
    String h = requestHeaders(s.getInputStream());
    String key =
        Arrays.stream(h.split("\r\n"))
            .filter(x -> x.startsWith("Sec-WebSocket-Key:"))
            .findFirst()
            .get()
            .split(":", 2)[1]
            .trim();
    String expected =
        Base64.getEncoder()
            .encodeToString(
                MessageDigest.getInstance("SHA-1")
                    .digest(
                        (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                            .getBytes(StandardCharsets.US_ASCII)));
    s.getOutputStream()
        .write(
            ("HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: "
                    + (valid ? expected : "wrong")
                    + "\r\n\r\n")
                .getBytes(StandardCharsets.US_ASCII));
    s.getOutputStream().flush();
  }

  @Test
  public void rejectsInvalidHandshakeWithoutStartingAReader() throws Exception {
    try (ServerSocket server = new ServerSocket(0)) {
      CompletableFuture<Void> remote =
          CompletableFuture.runAsync(
              () -> {
                try (Socket s = server.accept()) {
                  accept(s, false);
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              });
      try (CdpWire ignored = new CdpWire(factory(server), "/devtools/page/test", x -> {})) {
        fail("Invalid handshake accepted");
      } catch (IOException expected) {
        assertTrue(expected.getMessage().contains("handshake"));
      }
      remote.get(5, TimeUnit.SECONDS);
    }
  }

  @Test
  public void reconstructsFragmentedUtf8AndRespondsToPingWithMaskedPong() throws Exception {
    try (ServerSocket server = new ServerSocket(0)) {
      CompletableFuture<Void> remote =
          CompletableFuture.runAsync(
              () -> {
                try (Socket s = server.accept()) {
                  s.setSoTimeout(3000);
                  accept(s, true);
                  InputStream in = s.getInputStream();
                  assertEquals(129, in.read());
                  int n = in.read();
                  assertTrue((n & 128) != 0);
                  n &= 127;
                  byte[] mask = CdpWire.read(in, 4), payload = CdpWire.read(in, n);
                  for (int i = 0; i < n; i++) payload[i] ^= mask[i % 4];
                  JSONObject request = new JSONObject(new String(payload, StandardCharsets.UTF_8));
                  byte[] data =
                      new JSONObject()
                          .put("id", request.getInt("id"))
                          .put("result", new JSONObject().put("text", "привет"))
                          .toString()
                          .getBytes(StandardCharsets.UTF_8);
                  int split = data.length / 2;
                  for (int i = 0; i < data.length; i++)
                    if ((data[i] & 255) == 0xd0) {
                      split = i + 1;
                      break;
                    }
                  OutputStream out = s.getOutputStream();
                  out.write(1);
                  out.write(split);
                  out.write(data, 0, split);
                  out.write(new byte[] {(byte) 137, 1, 42});
                  out.write(128);
                  out.write(data.length - split);
                  out.write(data, split, data.length - split);
                  out.flush();
                  assertEquals(138, in.read());
                  assertEquals(129, in.read());
                  byte[] pongMask = CdpWire.read(in, 4), pong = CdpWire.read(in, 1);
                  assertEquals(42, (pong[0] ^ pongMask[0]) & 255);
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              });
      try (CdpWire wire = new CdpWire(factory(server), "/devtools/page/test", x -> {})) {
        assertEquals("привет", wire.call("test", new JSONObject()).getString("text"));
        remote.get(5, TimeUnit.SECONDS);
      }
    }
  }

  @Test
  public void disconnectFailsPendingCallsInsteadOfReturningStaleResponse() throws Exception {
    try (ServerSocket server = new ServerSocket(0)) {
      CompletableFuture<Void> remote =
          CompletableFuture.runAsync(
              () -> {
                try (Socket s = server.accept()) {
                  accept(s, true);
                  Thread.sleep(100);
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              });
      try (CdpWire wire = new CdpWire(factory(server), "/devtools/page/test", x -> {})) {
        try {
          wire.call("test", new JSONObject());
          fail("Disconnected call succeeded");
        } catch (Exception expected) {
        }
      }
      remote.get(5, TimeUnit.SECONDS);
    }
  }
}
