import type { Profile } from "./profile";
// Contrasting light/dark and material families. Cosmetic progression never consumes dealer RNG.
const TOUR = [1, 5, 2, 8, 3, 6, 4, 9, 7, 10, 0];
export function discoverTheme(p: Profile): NonNullable<Profile["wardrobe"]> {
  const old = p.wardrobe ?? { selected: 0, unlocked: [0], discoveries: 0 };
  let selected = TOUR[old.discoveries % TOUR.length]!;
  if (selected === old.selected)
    selected = TOUR[(old.discoveries + 1) % TOUR.length]!;
  return {
    selected,
    unlocked: [...new Set([...old.unlocked, selected])],
    discoveries: old.discoveries + 1,
  };
}
