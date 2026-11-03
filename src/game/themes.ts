export const THEMES = [
  {
    at: 0,
    name: "Пластик",
    bg: "#deebf2",
    ink: "#263f58",
    accent: "#e8aa32",
    board: 0x607e98,
    material: "plastic",
  },
  {
    at: 3,
    name: "Янтарь",
    bg: "#dce9f1",
    ink: "#263f58",
    accent: "#e8aa32",
    board: 0x5d7c97,
    material: "amber",
  },
  {
    at: 6,
    name: "Эмаль",
    bg: "#f0e8d5",
    ink: "#484b43",
    accent: "#ffbd44",
    board: 0x5f7c83,
    material: "enamel",
  },
  {
    at: 10,
    name: "Золото",
    bg: "#f2e7cf",
    ink: "#484b43",
    accent: "#ffbd44",
    board: 0x5a777f,
    material: "gold",
  },
  {
    at: 15,
    name: "Сияние",
    bg: "#f3e5c9",
    ink: "#484b43",
    accent: "#ffbd44",
    board: 0x55727b,
    material: "ice",
  },
  {
    at: 20,
    name: "Хром",
    bg: "#234660",
    ink: "#f3f6f8",
    accent: "#ffcf69",
    board: 0x405e7a,
    material: "chrome",
  },
  {
    at: 30,
    name: "Ритм",
    bg: "#274961",
    ink: "#f3f6f8",
    accent: "#ffcf69",
    board: 0x42607b,
    material: "magma",
  },
  {
    at: 40,
    name: "Опал",
    bg: "#2a4b63",
    ink: "#f3f6f8",
    accent: "#ffcf69",
    board: 0x44627c,
    material: "opal",
  },
  {
    at: 50,
    name: "Затмение",
    bg: "#304c68",
    ink: "#f3f6f8",
    accent: "#ffcf69",
    board: 0x46617f,
    material: "eclipse",
  },
  {
    at: 75,
    name: "Сверхновая",
    bg: "#354c6a",
    ink: "#f3f6f8",
    accent: "#ffcf69",
    board: 0x496180,
    material: "nova",
  },
  {
    at: 100,
    name: "Призма",
    bg: "#294e62",
    ink: "#f3f6f8",
    accent: "#ffcf69",
    board: 0x42677c,
    material: "prism",
  },
] as const;
export function themeFor(streak: number) {
  let index = 0;
  THEMES.forEach((t, i) => {
    if (streak >= t.at) index = i;
  });
  return Math.max(0, index);
}
export function themeAccent(streak: number) {
  return streak < 100
    ? THEMES[themeFor(streak)]!.accent
    : ["#92dded", "#f7b0c5", "#c7e68d", "#d7b3ff"][
        Math.floor((streak - 100) / 25) % 4
      ]!;
}
export function seriesPitch(streak: number) {
  return [0, 3, 5, 7, 10, 12, 15, 17][Math.min(7, Math.max(0, streak - 1))]!;
}

// Presentation milestones for v4. Preserve v3 theme indices/material contracts.
export const SERIES_STEPS = [0, 2, 4, 6, 8, 10, 13, 16, 20, 26, 34] as const;
export function seriesStep(streak: number) {
  let step = 0;
  SERIES_STEPS.forEach((at, i) => {
    if (streak >= at) step = i;
  });
  return step;
}
export function seriesVisual(streak: number) {
  const step = seriesStep(streak);
  return (
    THEMES[step]!.at + (step === 10 ? Math.floor((streak - 34) / 8) * 25 : 0)
  );
}
export function labelDevelopment(streak: number) {
  const step = seriesStep(streak);
  const from = SERIES_STEPS[step]!;
  const to = SERIES_STEPS[Math.min(step + 1, 10)]!;
  const fraction = to > from ? (streak - from) / (to - from) : 0;
  return {
    step,
    size: Math.min(1.3, 0.8 + step * 0.06 + fraction * 0.04),
    hold: Math.min(650, step * 65),
  };
}
