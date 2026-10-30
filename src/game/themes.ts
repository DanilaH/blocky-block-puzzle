export const THEMES = [
  {
    at: 0,
    name: "Пластик",
    bg: "#eee9dd",
    ink: "#383329",
    accent: "#efaa39",
    board: 0x35363b,
    material: "plastic",
  },
  {
    at: 3,
    name: "Янтарь",
    bg: "#f2c8a6",
    ink: "#59331f",
    accent: "#ffad22",
    board: 0x47342c,
    material: "amber",
  },
  {
    at: 6,
    name: "Вишнёвая эмаль",
    bg: "#521e32",
    ink: "#ffebd5",
    accent: "#ffb352",
    board: 0x2c202c,
    material: "enamel",
  },
  {
    at: 10,
    name: "Золото",
    bg: "#281b16",
    ink: "#fff0ca",
    accent: "#ffce54",
    board: 0x302722,
    material: "gold",
  },
  {
    at: 15,
    name: "Лёд",
    bg: "#c5e6ee",
    ink: "#214c62",
    accent: "#77dcff",
    board: 0x233d4b,
    material: "ice",
  },
  {
    at: 20,
    name: "Хром",
    bg: "#b5bcc5",
    ink: "#252c39",
    accent: "#eff6ff",
    board: 0x222831,
    material: "chrome",
  },
  {
    at: 30,
    name: "Магма",
    bg: "#251d1b",
    ink: "#ffe4c8",
    accent: "#ff7738",
    board: 0x342422,
    material: "magma",
  },
  {
    at: 40,
    name: "Опал",
    bg: "#ede2e6",
    ink: "#514257",
    accent: "#bf8add",
    board: 0x403545,
    material: "opal",
  },
  {
    at: 50,
    name: "Затмение",
    bg: "#111b35",
    ink: "#f2e6ca",
    accent: "#edc874",
    board: 0x202b42,
    material: "eclipse",
  },
  {
    at: 75,
    name: "Сверхновая",
    bg: "#301321",
    ink: "#fff0db",
    accent: "#fff0b2",
    board: 0x32232d,
    material: "nova",
  },
  {
    at: 100,
    name: "Призма",
    bg: "#171d29",
    ink: "#e9efff",
    accent: "#92dded",
    board: 0x262d41,
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
