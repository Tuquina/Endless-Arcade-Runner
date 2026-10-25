/** Deterministic pseudo-random 0..1 for an integer-ish input: lets decorations be "random" yet stay glued to the world as it scrolls. */
export const hash = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
