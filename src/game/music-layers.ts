// Original, deterministic percussion loops. Render once, never on a placement.
// Sixteen beats at the backing track's 118 BPM; no tonal material competing
// with its melody. Shared phase is retained across pause/resume.
export function percussionLoops(context: AudioContext) {
  const beat = 60 / 118,
    duration = beat * 16;
  let seed = 7331;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  return [0, 1, 2].map((layer) => {
    const b = context.createBuffer(
      1,
      Math.round(duration * context.sampleRate),
      context.sampleRate,
    );
    const data = b.getChannelData(0);
    for (let step = 0; step < 32; step++) {
      if (layer === 1 && ![3, 6, 10, 14].includes(step % 16)) continue;
      if (layer === 2 && ![0, 7, 12].includes(step % 16)) continue;
      const start = Math.round(((step * beat) / 2) * context.sampleRate);
      const tail = layer === 0 ? 0.075 : layer === 1 ? 0.1 : 0.19;
      let previous = 0;
      for (
        let j = 0;
        j < tail * context.sampleRate && start + j < data.length;
        j++
      ) {
        const t = j / context.sampleRate,
          n = noise();
        const env = Math.min(1, t / 0.002) * Math.exp(-t / (tail / 5));
        const sound =
          layer === 0
            ? (n - previous) * 0.4
            : layer === 1
              ? Math.sin(2 * Math.PI * 1450 * t) * 0.45 + n * 0.12
              : Math.sin(2 * Math.PI * (155 * t - 190 * t * t)) * 0.65 +
                n * 0.04;
        data[start + j]! += sound * env * (step % 2 ? 0.65 : 1);
        previous = n;
      }
    }
    return b;
  });
}
export function percussionLevels(streak: number) {
  return [
    streak >= 2 ? 0.65 : 0,
    streak >= 4 ? 0.65 : 0,
    streak >= 6 ? (streak >= 10 ? 0.9 : 0.6) : 0,
  ];
}
