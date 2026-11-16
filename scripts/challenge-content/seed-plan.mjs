/** Outcome-independent stratification of the existing eight authored openings. */
import assert from "node:assert/strict";
const next = (state) => {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
};
function mix(n) {
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0 || 1;
}
export function challengeSeedPlan(stage) {
  assert(["development-v2", "holdout-v2"].includes(stage));
  const base = stage === "development-v2" ? 8107001 : 8108001;
  return Array.from({ length: 16 }, (_, i) => {
    const caseId = base + i,
      opening = i % 8,
      rotation = Math.floor(i / 8) + (stage === "holdout-v2" ? 2 : 0);
    let seed = mix(caseId),
      attempt = 0;
    while (attempt++ < 100000) {
      const a = next(seed),
        b = next(a);
      if (
        Math.floor((a / 2 ** 32) * 8) === opening &&
        Math.floor((b / 2 ** 32) * 4) === rotation
      )
        return { caseId, seed, opening, rotation };
      seed = next(seed) || 1;
    }
    throw Error("Opening stratification failed");
  });
}
