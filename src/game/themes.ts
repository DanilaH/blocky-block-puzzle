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
    name: "Фарфор",
    bg: "#f4f3ee",
    ink: "#325376",
    accent: "#72a8ec",
    board: 0xc9dbe7,
    material: "amber",
  },
  {
    at: 6,
    name: "Розовый кварц",
    bg: "#f5dfe7",
    ink: "#713f58",
    accent: "#e783b3",
    board: 0xbd8fa7,
    material: "enamel",
  },
  {
    at: 10,
    name: "Лаванда",
    bg: "#dfd5ed",
    ink: "#594471",
    accent: "#aa86e1",
    board: 0x9c88b7,
    material: "gold",
  },
  {
    at: 15,
    name: "Мёд",
    bg: "#f3de9f",
    ink: "#73501e",
    accent: "#efb83f",
    board: 0xb28b45,
    material: "ice",
  },
  {
    at: 20,
    name: "Полярная ночь",
    bg: "#233f57",
    ink: "#f2f4f7",
    accent: "#a5e8ef",
    board: 0x46647a,
    material: "chrome",
  },
  {
    at: 30,
    name: "Терракота",
    bg: "#b56f56",
    ink: "#fff1e4",
    accent: "#f5c770",
    board: 0x74473d,
    material: "magma",
  },
  {
    at: 40,
    name: "Опал",
    bg: "#d6ede9",
    ink: "#355f64",
    accent: "#86c8d0",
    board: 0x7da7a8,
    material: "opal",
  },
  {
    at: 50,
    name: "Лунный свет",
    bg: "#4b4d64",
    ink: "#f2f1fa",
    accent: "#ddd9f3",
    board: 0x73758d,
    material: "eclipse",
  },
  {
    at: 75,
    name: "Сверхновая",
    bg: "#443754",
    ink: "#fff0e7",
    accent: "#ffb977",
    board: 0x665278,
    material: "nova",
  },
  {
    at: 100,
    name: "Призма",
    bg: "#e0e9f0",
    ink: "#3c506e",
    accent: "#a69ce8",
    board: 0x8d9fb7,
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

/** Texture index; logical board colors remain untouched. */
export function themeTile(theme: number, color: number) {
  return [0, 7, 8, 9, 10, 11, 0, 11, 12, 0, 0][theme] || color;
}
