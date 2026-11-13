package com.danilah.blocky.dev;
import static org.junit.Assert.*;
import java.io.*;
import org.junit.Test;
public class BoundedTraceStreamTest {
  @Test public void oversizedTraceIsFlaggedAndDrainedWithoutGrowingDisk() throws Exception {
    ByteArrayOutputStream disk = new ByteArrayOutputStream();
    BoundedTraceStream stream = new BoundedTraceStream(disk, 5);
    stream.write(new byte[]{1,2,3}); stream.write(new byte[]{4,5,6});
    stream.write(new byte[]{7}); stream.close();
    assertTrue(stream.truncated()); assertEquals(3, stream.bytes()); assertEquals(3, disk.size());
  }
  @Test public void diskFailureIsMarkedAndRemainingChunksAreDrained() throws Exception {
    BoundedTraceStream stream = new BoundedTraceStream(new OutputStream() {
      @Override public void write(int value) throws IOException { throw new IOException("Disk full"); }
    }, 10);
    stream.write(new byte[]{1,2}); stream.write(new byte[]{3}); stream.close();
    assertTrue(stream.failed()); assertEquals(0, stream.bytes());
  }
  @Test public void exactLimitRemainsValidAndCloseIsIdempotent() throws Exception {
    ByteArrayOutputStream disk = new ByteArrayOutputStream();
    BoundedTraceStream stream = new BoundedTraceStream(disk, 3);
    stream.write(1); stream.write(new byte[]{2,3}); stream.close(); stream.close();
    assertFalse(stream.truncated()); assertEquals(3, stream.bytes());
    assertArrayEquals(new byte[]{1,2,3}, disk.toByteArray());
  }
}
