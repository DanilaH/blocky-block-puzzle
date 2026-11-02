package com.danilah.blocky.dev;
import org.junit.Test;
import static org.junit.Assert.*;
public class HapticPatternTest {
  @Test public void finiteWaveformsWorkWithAndWithoutAmplitudeControl() {
    for(String kind : new String[]{"place","clear","record","empty","defeat"}) {
      for(int level = 1; level <= 8; level++) {
        HapticPattern p = HapticPattern.forEvent(kind, level);
        assertEquals(p.times.length, p.amplitudes.length);
        assertTrue(p.duration > 0 && p.duration <= 900);
        assertEquals(0, p.times[0]);
        for(int i = 0; i < p.times.length; i++) {
          assertTrue(p.amplitudes[i] >= 0 && p.amplitudes[i] <= 255);
          assertEquals(i % 2 == 0, p.amplitudes[i] == 0);
          if(i > 0) assertTrue(p.times[i] > 0);
        }
      }
    }
    assertTrue(HapticPattern.forEvent("empty",1).duration > HapticPattern.forEvent("clear",8).duration);
    assertEquals(12, HapticPattern.forEvent("empty",1).times.length);
  }
  @Test public void largeClearSurvivesMilestonesAndRepeatedCalls() {
    HapticPattern.Gate g = new HapticPattern.Gate();
    assertTrue(g.accept(1000,HapticPattern.forEvent("clear",8)));
    assertFalse(g.accept(1100,HapticPattern.forEvent("place",1)));
    assertFalse(g.accept(1300,HapticPattern.forEvent("record",1)));
    assertFalse(g.accept(1400,HapticPattern.forEvent("clear",8)));
    assertTrue(g.accept(1620,HapticPattern.forEvent("clear",8)));
  }
  @Test public void emptyFieldWinsAndLifecycleResetDiscardsProtection() {
    HapticPattern.Gate g = new HapticPattern.Gate();
    assertTrue(g.accept(1000,HapticPattern.forEvent("clear",8)));
    assertTrue(g.accept(1100,HapticPattern.forEvent("empty",1)));
    assertFalse(g.accept(1400,HapticPattern.forEvent("record",1)));
    assertFalse(g.accept(1500,HapticPattern.forEvent("empty",1)));
    g.reset();
    assertTrue(g.accept(1550,HapticPattern.forEvent("place",1)));
    assertTrue(g.accept(1560,HapticPattern.forEvent("defeat",1)));
  }
}
