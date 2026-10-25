// Correspondence and framing estimates retained from the original PTZ viewer.
// These aid visual inspection; they do not correct generated geometry.
const timing = [
  [0, 0.5],
  [0.5, 1.05],
  [1, 1.85],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [8.87, 9.4],
];
const framing = [
  [0, 1.32, 3.5, -1.8],
  [0.12, 1.02, 0, 0],
  [0.25, 1.02, -1, 1],
  [0.4, 1.04, -2, 2],
  [0.6, 1.05, -3, 3],
  [0.8, 1.08, -2, 3],
  [1, 1.08, -2, 3],
];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function segment(points: number[][], value: number) {
  let i = 0;
  while (i < points.length - 2 && value > points[i + 1][0]) i++;
  return [points[i], points[i + 1]];
}
export function ptzSample(time: number, sourceDuration: number, resultDuration: number) {
  const reverse = time > sourceDuration / 2;
  const forward = clamp(reverse ? sourceDuration - time : time, 0, sourceDuration / 2);
  const [l, r] = segment(timing, forward);
  const rate = (r[1] - l[1]) / (r[0] - l[0]);
  const mapped = clamp(l[1] + (forward - l[0]) * rate - 0.5, 0, resultDuration / 2);
  const [a, b] = segment(framing, forward / (sourceDuration / 2));
  const f = clamp((forward / (sourceDuration / 2) - a[0]) / (b[0] - a[0]), 0, 1);
  const values = a.map((v, i) => v + (b[i] - v) * f);
  return {
    time: clamp(reverse ? resultDuration - mapped : mapped, 0, resultDuration - 0.04),
    rate,
    scale: values[1],
    x: values[2],
    y: values[3],
  };
}
