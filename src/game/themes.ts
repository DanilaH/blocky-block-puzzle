export const THEMES = [
  {
    at: 0,
    name: "Пластик",
    bg: "#edf6fa",
    ink: "#304959",
    accent: "#efaa39",
    board: 0xcce7f3,
    material: "plastic",
  },
  {
    at: 3,
    name: "Янтарь",
    bg: "#fff0db",
    ink: "#59331f",
    accent: "#ffad22",
    board: 0xf4dcad,
    material: "amber",
  },
  {
    at: 6,
    name: "Вишнёвая эмаль",
    bg: "#f5d8df",
    ink: "#713345",
    accent: "#ffb352",
    board: 0xe7bacb,
    material: "enamel",
  },
  {
    at: 10,
    name: "Золото",
    bg: "#fff1bf",
    ink: "#67481d",
    accent: "#ffce54",
    board: 0xeed494,
    material: "gold",
  },
  {
    at: 15,
    name: "Лёд",
    bg: "#dff4f8",
    ink: "#214c62",
    accent: "#77dcff",
    board: 0xb9e4ef,
    material: "ice",
  },
  {
    at: 20,
    name: "Хром",
    bg: "#dce9f2",
    ink: "#252c39",
    accent: "#eff6ff",
    board: 0xbfcfdf,
    material: "chrome",
  },
  {
    at: 30,
    name: "Магма",
    bg: "#ffd5bd",
    ink: "#6e3525",
    accent: "#ff7738",
    board: 0xf2b99c,
    material: "magma",
  },
  {
    at: 40,
    name: "Опал",
    bg: "#efe5f7",
    ink: "#514257",
    accent: "#bf8add",
    board: 0xd7c7eb,
    material: "opal",
  },
  {
    at: 50,
    name: "Затмение",
    bg: "#293b68",
    ink: "#f2e6ca",
    accent: "#edc874",
    board: 0xa9bfdf,
    material: "eclipse",
  },
  {
    at: 75,
    name: "Сверхновая",
    bg: "#633d75",
    ink: "#fff0db",
    accent: "#fff0b2",
    board: 0xdfbce5,
    material: "nova",
  },
  {
    at: 100,
    name: "Призма",
    bg: "#d9edf1",
    ink: "#284959",
    accent: "#92dded",
    board: 0xc2dcdf,
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
