import { chooseWave } from "./wave-short";
export { initialDirector, revived, observe } from "./wave-short";
export const select: (
  g: Parameters<typeof chooseWave>[0],
  d: Parameters<typeof chooseWave>[1],
  limits?: Parameters<typeof chooseWave>[3],
) => ReturnType<typeof chooseWave> = (g, d, limits) =>
  chooseWave(g, d, "guaranteed", limits);
