package com.danilah.blocky.dev;

import java.io.IOException;
import java.io.OutputStream;

/** Drain all WebView chunks even after the disk cap, and flag the invalid trace. */
class BoundedTraceStream extends OutputStream {
  private final OutputStream output;
  private final long limit;
  private long bytes;
  private boolean truncated;
  private boolean closed;
  private boolean failed;
  BoundedTraceStream(OutputStream output, long limit) { this.output = output; this.limit = limit; }
  long bytes() { return bytes; }
  boolean truncated() { return truncated; }
  boolean failed() { return failed; }
  @Override public void write(int value) throws IOException { write(new byte[]{(byte) value}, 0, 1); }
  @Override public void write(byte[] value, int offset, int length) throws IOException {
    if (closed) throw new IOException("Trace stream closed");
    if (truncated || failed) return;
    if (length > limit - bytes) { truncated = true; return; }
    try { output.write(value, offset, length); bytes += length; }
    catch (IOException failure) { failed = true; /* Drain remaining chunks. */ }
  }
  @Override public void close() throws IOException {
    if (!closed) { closed = true; output.close(); }
  }
}
