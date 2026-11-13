package com.danilah.blocky.dev.cdp;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.json.*;

/** Bounded RFC6455/CDP client over caller-owned streams; Android supplies LocalSocket. */
public final class CdpWire implements Closeable {
  public interface Transport extends Closeable {
    InputStream input() throws IOException;

    OutputStream output() throws IOException;
  }

  public interface Factory {
    Transport open() throws IOException;
  }

  private final Transport transport;
  private final InputStream input;
  private final OutputStream output;
  private final SecureRandom random = new SecureRandom();
  private final AtomicInteger ids = new AtomicInteger();
  private final Map<Integer, CompletableFuture<JSONObject>> pending = new ConcurrentHashMap<>();
  private final Consumer<JSONObject> listener;
  private volatile boolean closed;
  private static final int LIMIT = 8 * 1024 * 1024;

  public static JSONArray targets(Factory factory) throws Exception {
    try (Transport t = factory.open()) {
      t.output()
          .write(
              "GET /json/list HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
                  .getBytes(StandardCharsets.US_ASCII));
      t.output().flush();
      Map<String, String> headers = headers(t.input(), "200");
      int size = Integer.parseInt(headers.getOrDefault("content-length", "-1"));
      if (size < 0 || size > 1024 * 1024) throw new IOException("Invalid DevTools discovery size");
      return new JSONArray(new String(read(t.input(), size), StandardCharsets.UTF_8));
    }
  }

  public CdpWire(Factory factory, String path, Consumer<JSONObject> listener) throws Exception {
    if (!path.startsWith("/devtools/page/") || path.contains("\r") || path.contains("\n"))
      throw new IOException("Invalid own-page endpoint");
    this.listener = listener;
    transport = factory.open();
    input = transport.input();
    output = transport.output();
    try {
      byte[] nonce = new byte[16];
      random.nextBytes(nonce);
      String key = Base64.getEncoder().encodeToString(nonce);
      output.write(
          ("GET "
                  + path
                  + " HTTP/1.1\r\n"
                  + "Host: localhost\r\n"
                  + "Upgrade: websocket\r\n"
                  + "Connection: Upgrade\r\n"
                  + "Sec-WebSocket-Key: "
                  + key
                  + "\r\nSec-WebSocket-Version: 13\r\n\r\n")
              .getBytes(StandardCharsets.US_ASCII));
      output.flush();
      Map<String, String> headers = headers(input, "101");
      String expected =
          Base64.getEncoder()
              .encodeToString(
                  MessageDigest.getInstance("SHA-1")
                      .digest(
                          (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                              .getBytes(StandardCharsets.US_ASCII)));
      if (!expected.equals(headers.get("sec-websocket-accept")))
        throw new IOException("DevTools handshake mismatch");
      Thread reader = new Thread(this::receive, "blocky-cdp-reader");
      reader.setDaemon(true);
      reader.start();
    } catch (Exception e) {
      transport.close();
      throw e;
    }
  }

  public JSONObject call(String method, JSONObject params) throws Exception {
    int id = ids.incrementAndGet();
    CompletableFuture<JSONObject> response = new CompletableFuture<>();
    pending.put(id, response);
    try {
      send(
          1,
          new JSONObject()
              .put("id", id)
              .put("method", method)
              .put("params", params)
              .toString()
              .getBytes(StandardCharsets.UTF_8));
      JSONObject message = response.get(12, TimeUnit.SECONDS);
      if (message.has("error"))
        throw new IOException(method + ": " + message.getJSONObject("error").optString("message"));
      return message.optJSONObject("result") == null
          ? new JSONObject()
          : message.getJSONObject("result");
    } finally {
      pending.remove(id);
    }
  }

  private void receive() {
    ByteArrayOutputStream message = new ByteArrayOutputStream();
    boolean fragmented = false;
    try {
      while (!closed) {
        int first = input.read();
        if (first < 0) throw new EOFException("DevTools closed");
        int second = input.read();
        if (second < 0) throw new EOFException();
        boolean fin = (first & 128) != 0;
        int opcode = first & 15;
        if ((first & 112) != 0 || (second & 128) != 0)
          throw new IOException("Invalid server WebSocket frame");
        long size = second & 127;
        if (size == 126) {
          byte[] n = read(input, 2);
          size = ((n[0] & 255) << 8) | (n[1] & 255);
        } else if (size == 127) {
          size = 0;
          for (byte b : read(input, 8)) {
            if (size > LIMIT) throw new IOException("Frame limit");
            size = (size << 8) | (b & 255);
          }
        }
        if (size > LIMIT || size < 0 || (opcode >= 8 && (!fin || size > 125)))
          throw new IOException("Frame limit or invalid control frame");
        byte[] payload = read(input, (int) size);
        if (opcode == 8) throw new EOFException("DevTools closed");
        if (opcode == 9) {
          send(10, payload);
          continue;
        }
        if (opcode == 10) continue;
        if (opcode == 1) {
          if (fragmented) throw new IOException("Nested message");
          message.reset();
          fragmented = !fin;
        } else if (opcode != 0 || !fragmented) throw new IOException("Unexpected frame opcode");
        if (message.size() + payload.length > LIMIT) throw new IOException("Message limit");
        message.write(payload);
        if (!fin) continue;
        fragmented = false;
        JSONObject event = new JSONObject(message.toString("UTF-8"));
        if (event.has("id")) {
          CompletableFuture<JSONObject> f = pending.get(event.getInt("id"));
          if (f != null) f.complete(event);
        } else listener.accept(event);
      }
    } catch (Exception failure) {
      pending.values().forEach(p -> p.completeExceptionally(failure));
    } finally {
      try {
        close();
      } catch (IOException ignored) {
      }
    }
  }

  private synchronized void send(int opcode, byte[] bytes) throws IOException {
    if (closed) throw new IOException("DevTools disconnected");
    ByteArrayOutputStream frame = new ByteArrayOutputStream(bytes.length + 14);
    frame.write(128 | opcode);
    int n = bytes.length;
    if (n < 126) frame.write(128 | n);
    else if (n <= 65535) {
      frame.write(128 | 126);
      frame.write(n >>> 8);
      frame.write(n);
    } else {
      frame.write(128 | 127);
      for (int i = 7; i >= 0; i--) frame.write((int) (((long) n) >>> (i * 8)) & 255);
    }
    byte[] mask = new byte[4];
    random.nextBytes(mask);
    frame.write(mask);
    byte[] encoded = bytes.clone();
    for (int i = 0; i < encoded.length; i++) encoded[i] ^= mask[i % 4];
    frame.write(encoded);
    output.write(frame.toByteArray());
    output.flush();
  }

  static byte[] read(InputStream input, int count) throws IOException {
    byte[] bytes = new byte[count];
    int n = 0;
    while (n < count) {
      int got = input.read(bytes, n, count - n);
      if (got < 0) throw new EOFException();
      n += got;
    }
    return bytes;
  }

  static Map<String, String> headers(InputStream input, String expected) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    int suffix = 0;
    while (suffix != 0x0d0a0d0a) {
      int b = input.read();
      if (b < 0) throw new EOFException("Incomplete DevTools headers");
      bytes.write(b);
      suffix = (suffix << 8) | b;
      if (bytes.size() > 16384) throw new IOException("Header limit");
    }
    String[] lines = bytes.toString("US-ASCII").split("\r\n");
    if (!lines[0].startsWith("HTTP/1.1 " + expected + " "))
      throw new IOException("DevTools HTTP status: " + lines[0]);
    Map<String, String> h = new HashMap<>();
    for (int i = 1; i < lines.length; i++) {
      int colon = lines[i].indexOf(':');
      if (colon > 0)
        h.put(
            lines[i].substring(0, colon).toLowerCase(Locale.ROOT),
            lines[i].substring(colon + 1).trim());
    }
    return h;
  }

  @Override
  public synchronized void close() throws IOException {
    if (closed) return;
    closed = true;
    transport.close();
    pending.values().forEach(p -> p.completeExceptionally(new IOException("DevTools closed")));
  }
}
