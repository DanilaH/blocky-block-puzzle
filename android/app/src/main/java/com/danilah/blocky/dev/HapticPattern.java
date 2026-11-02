package com.danilah.blocky.dev;

/** Finite alternating on/off waveforms also work without amplitude control. */
public final class HapticPattern {
  public final long[] times;
  public final int[] amplitudes;
  public final int priority;
  public final long duration;
  private HapticPattern(int priority, long[] times, int[] amplitudes) {
    this.priority = priority;
    this.times = times;
    this.amplitudes = amplitudes;
    long total = 0;
    for (long t : times) total += t;
    this.duration = total;
  }
  public static HapticPattern forEvent(String kind, int level) {
    switch (kind) {
      case "empty": return new HapticPattern(5,
        new long[]{0,55,40,65,45,80,55,100,65,130,75,180},
        new int[]{0,195,0,215,0,235,0,255,0,255,0,255});
      case "defeat": return new HapticPattern(6,
        new long[]{0,45,100,90}, new int[]{0,175,0,220});
      case "record": return new HapticPattern(2,
        new long[]{0,40,45,60,55,100}, new int[]{0,205,0,235,0,255});
      case "clear":
        if (level >= 8) return new HapticPattern(4,
          new long[]{0,45,35,60,40,80,45,100,55,160},
          new int[]{0,210,0,230,0,245,0,255,0,255});
        if (level >= 6) return new HapticPattern(4,
          new long[]{0,45,40,65,45,90,55,140},
          new int[]{0,205,0,230,0,250,0,255});
        if (level >= 4) return new HapticPattern(3,
          new long[]{0,40,40,65,50,110}, new int[]{0,200,0,230,0,255});
        if (level >= 2) return new HapticPattern(1,
          new long[]{0,35,35,50,40,75}, new int[]{0,190,0,220,0,245});
        return new HapticPattern(1,
          new long[]{0,35,45,60}, new int[]{0,200,0,240});
      default: return new HapticPattern(0, new long[]{0,30}, new int[]{0,195});
    }
  }
  /** No queue: stale tactile rewards must not continue after the action ends. */
  public static final class Gate {
    private long until;
    private int priority;
    public boolean accept(long now, HapticPattern next) {
      if (now < until && next.priority <= priority) return false;
      until = now + next.duration;
      priority = next.priority;
      return true;
    }
    public void reset() { until = 0; priority = 0; }
  }
}
